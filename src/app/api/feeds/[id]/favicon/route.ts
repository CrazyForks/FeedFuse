import { requireApiSession } from '@/server/domains/auth/services/session';
import sharp from 'sharp';
import { getPool } from '@/server/infra/db/pool';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getOrFetchFeedFavicon } from '@/server/domains/feeds/services/feedFaviconService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FAVICON_CACHE_CONTROL = 'private, max-age=86400, stale-while-revalidate=604800';

type FaviconDecodeCandidate = {
  bytes: Uint8Array;
  raw?: { width: number; height: number; channels: 4 };
};

function decodeIcoDibFrame(frame: Buffer): FaviconDecodeCandidate | null {
  if (frame.byteLength < 40) return null;

  const headerSize = frame.readUInt32LE(0);
  const width = Math.abs(frame.readInt32LE(4));
  const storedHeight = frame.readInt32LE(8);
  const height = Math.floor(Math.abs(storedHeight) / 2);
  const bitsPerPixel = frame.readUInt16LE(14);
  const compression = frame.readUInt32LE(16);
  if (
    headerSize < 40 ||
    width < 1 ||
    height < 1 ||
    (bitsPerPixel !== 24 && bitsPerPixel !== 32) ||
    compression !== 0
  ) {
    return null;
  }

  const colorRowBytes = Math.ceil((width * bitsPerPixel) / 32) * 4;
  const maskRowBytes = Math.ceil(width / 32) * 4;
  const colorOffset = headerSize;
  const maskOffset = colorOffset + colorRowBytes * height;
  if (maskOffset + maskRowBytes * height > frame.byteLength) return null;

  const rgba = Buffer.alloc(width * height * 4);
  let hasEmbeddedAlpha = false;
  for (let y = 0; y < height; y += 1) {
    const sourceY = storedHeight > 0 ? height - y - 1 : y;
    for (let x = 0; x < width; x += 1) {
      const sourceOffset = colorOffset + sourceY * colorRowBytes + x * (bitsPerPixel / 8);
      const targetOffset = (y * width + x) * 4;
      rgba[targetOffset] = frame[sourceOffset + 2];
      rgba[targetOffset + 1] = frame[sourceOffset + 1];
      rgba[targetOffset + 2] = frame[sourceOffset];
      rgba[targetOffset + 3] = bitsPerPixel === 32 ? frame[sourceOffset + 3] : 255;
      hasEmbeddedAlpha ||= rgba[targetOffset + 3] !== 0;
    }
  }

  for (let y = 0; y < height; y += 1) {
    const sourceY = height - y - 1;
    for (let x = 0; x < width; x += 1) {
      const targetOffset = (y * width + x) * 4;
      const maskByte = frame[maskOffset + sourceY * maskRowBytes + Math.floor(x / 8)];
      const transparent = (maskByte & (0x80 >> (x % 8))) !== 0;
      if (transparent) {
        rgba[targetOffset + 3] = 0;
      } else if (bitsPerPixel === 32 && !hasEmbeddedAlpha) {
        rgba[targetOffset + 3] = 255;
      }
    }
  }

  return { bytes: rgba, raw: { width, height, channels: 4 } };
}

function getFaviconDecodeCandidates(body: Uint8Array): FaviconDecodeCandidate[] {
  const source = Buffer.from(body);
  if (
    source.byteLength < 6 ||
    source.readUInt16LE(0) !== 0 ||
    source.readUInt16LE(2) !== 1
  ) {
    return [{ bytes: source }];
  }

  const imageCount = source.readUInt16LE(4);
  if (imageCount < 1 || imageCount > 64 || source.byteLength < 6 + imageCount * 16) {
    return [{ bytes: source }];
  }

  // ICO 是图片容器；优先提取最接近 32px 的内嵌 PNG 或 DIB 帧。
  const frames: Array<{ dimension: number; candidate: FaviconDecodeCandidate }> = [];
  for (let index = 0; index < imageCount; index += 1) {
    const entryOffset = 6 + index * 16;
    const width = source[entryOffset] || 256;
    const height = source[entryOffset + 1] || 256;
    const byteLength = source.readUInt32LE(entryOffset + 8);
    const imageOffset = source.readUInt32LE(entryOffset + 12);

    if (byteLength === 0 || imageOffset + byteLength > source.byteLength) {
      continue;
    }

    const frame = source.subarray(imageOffset, imageOffset + byteLength);
    frames.push({
      dimension: Math.max(width, height),
      candidate: decodeIcoDibFrame(frame) ?? { bytes: frame },
    });
  }

  const candidates = frames
    .sort((left, right) => {
      const leftScore = left.dimension >= 32 ? left.dimension - 32 : 1000 + 32 - left.dimension;
      const rightScore = right.dimension >= 32 ? right.dimension - 32 : 1000 + 32 - right.dimension;
      return leftScore - rightScore;
    })
    .map((frame) => frame.candidate);

  return [...candidates, { bytes: source }];
}

async function optimizeFavicon(body: Uint8Array) {
  for (const candidate of getFaviconDecodeCandidates(body)) {
    try {
      // 侧栏按 16x16 CSS 像素展示，保留 2x 像素即可覆盖高分屏。
      const optimized = await sharp(candidate.bytes, {
        failOn: 'none',
        limitInputPixels: 16_000_000,
        ...(candidate.raw ? { raw: candidate.raw } : {}),
      })
        .rotate()
        .resize(32, 32, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80, effort: 4 })
        .toBuffer();

      if (optimized.byteLength < body.byteLength) {
        return optimized;
      }
    } catch {
      // 当前帧可能是 ICO 的 DIB 位图，继续尝试其他内嵌帧。
    }
  }

  return Buffer.from(body);
}

function isFreshByEtag(request: Request, etag: string | null): boolean {
  if (!etag) {
    return false;
  }

  return request.headers.get('if-none-match') === etag;
}

function isFreshByLastModified(request: Request, lastModified: string | null): boolean {
  if (!lastModified) {
    return false;
  }

  return request.headers.get('if-modified-since') === lastModified;
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  const params = await context.params;
  const parsedParams = numericIdSchema.safeParse(params.id);
  if (!parsedParams.success) {
    return new Response('Bad request', { status: 400 });
  }

  const asset = await getOrFetchFeedFavicon(getPool(), parsedParams.data, session?.userId);
  if (!asset) {
    return new Response('Not found', {
      status: 404,
      headers: {
        'cache-control': FAVICON_CACHE_CONTROL,
      },
    });
  }

  if (isFreshByEtag(request, asset.etag) || isFreshByLastModified(request, asset.lastModified)) {
    const headers = new Headers();
    headers.set('cache-control', FAVICON_CACHE_CONTROL);
    if (asset.etag) headers.set('etag', asset.etag);
    if (asset.lastModified) headers.set('last-modified', asset.lastModified);
    return new Response(null, { status: 304, headers });
  }

  const optimizedBody = await optimizeFavicon(asset.body);
  const wasOptimized = optimizedBody.byteLength < asset.body.byteLength;
  const responseBody = wasOptimized ? optimizedBody : asset.body;
  const headers = new Headers({
    'cache-control': FAVICON_CACHE_CONTROL,
    'content-length': String(responseBody.byteLength),
    'content-type': wasOptimized ? 'image/webp' : asset.contentType,
  });
  if (asset.etag) headers.set('etag', asset.etag);
  if (asset.lastModified) headers.set('last-modified', asset.lastModified);

  const body = new ArrayBuffer(responseBody.byteLength);
  new Uint8Array(body).set(responseBody);

  return new Response(body, {
    status: 200,
    headers,
  });
}
