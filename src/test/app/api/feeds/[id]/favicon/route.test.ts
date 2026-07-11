import { beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';

const getOrFetchFeedFaviconMock = vi.fn();

function wrapPngAsIco(png: Buffer, size: number) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header[6] = size >= 256 ? 0 : size;
  header[7] = size >= 256 ? 0 : size;
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.byteLength, 14);
  header.writeUInt32LE(header.byteLength, 18);
  return Buffer.concat([header, png]);
}

function createDibIco(size: number) {
  const colorRowBytes = Math.ceil((size * 24) / 32) * 4;
  const maskRowBytes = Math.ceil(size / 32) * 4;
  const dib = Buffer.alloc(40 + colorRowBytes * size + maskRowBytes * size);
  dib.writeUInt32LE(40, 0);
  dib.writeInt32LE(size, 4);
  dib.writeInt32LE(size * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(24, 14);

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = 40 + y * colorRowBytes + x * 3;
      dib[offset] = 210;
      dib[offset + 1] = 90;
      dib[offset + 2] = 35;
    }
  }

  return wrapPngAsIco(dib, size);
}

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/server/infra/db/pool', () => ({
  getPool: vi.fn(() => ({})),
}));

vi.mock('@/server/domains/feeds/services/feedFaviconService', () => ({
  getOrFetchFeedFavicon: (...args: unknown[]) => getOrFetchFeedFaviconMock(...args),
}));

describe('/api/feeds/[id]/favicon', () => {
  beforeEach(() => {
    getOrFetchFeedFaviconMock.mockReset();
  });

  it('returns 400 for invalid feed ids', async () => {
    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/not-a-number/favicon'), {
      params: Promise.resolve({ id: 'not-a-number' }),
    });

    expect(res.status).toBe(400);
  });

  it('returns 404 when the feed favicon cannot be resolved', async () => {
    getOrFetchFeedFaviconMock.mockResolvedValue(null);

    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });

    expect(res.status).toBe(404);
    expect(res.headers.get('cache-control')).toContain('max-age=86400');
  });

  it('returns optimized favicon bytes with cache headers', async () => {
    const sourceImage = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 3,
        background: { r: 60, g: 120, b: 220 },
      },
    }).png().toBuffer();

    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/png',
      body: sourceImage,
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });

    expect(res.status).toBe(200);
    const responseBody = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(responseBody).metadata();

    expect(res.headers.get('cache-control')).toContain('max-age=86400');
    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(res.headers.get('etag')).toBe('"favicon-etag"');
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(32);
    expect(responseBody.byteLength).toBeLessThan(sourceImage.byteLength);
  });

  it('returns 304 when the client already has the latest etag', async () => {
    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/png',
      body: Buffer.from('icon-bytes'),
      etag: '"favicon-etag"',
      lastModified: 'Tue, 01 Apr 2026 00:00:00 GMT',
      updatedAt: '2026-03-29T00:00:00.000Z',
    });

    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(
      new Request('http://localhost/api/feeds/1001/favicon', {
        headers: { 'if-none-match': '"favicon-etag"' },
      }),
      {
        params: Promise.resolve({ id: '1001' }),
      },
    );

    expect(res.status).toBe(304);
    expect(res.headers.get('cache-control')).toContain('max-age=86400');
  });

  it('extracts and optimizes png frames embedded in ico containers', async () => {
    const png = await sharp({
      create: {
        width: 256,
        height: 256,
        channels: 4,
        background: { r: 180, g: 40, b: 70, alpha: 1 },
      },
    }).png().toBuffer();
    const ico = wrapPngAsIco(png, 256);
    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/vnd.microsoft.icon',
      body: ico,
      etag: '"ico-etag"',
      lastModified: null,
    });

    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });
    const responseBody = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(responseBody).metadata();

    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(32);
    expect(responseBody.byteLength).toBeLessThan(ico.byteLength);
  });

  it('decodes and optimizes uncompressed 24-bit dib frames in ico containers', async () => {
    const ico = createDibIco(256);
    getOrFetchFeedFaviconMock.mockResolvedValue({
      contentType: 'image/vnd.microsoft.icon',
      body: ico,
      etag: '"dib-ico-etag"',
      lastModified: null,
    });

    const mod = await import('../../../../../../app/api/feeds/[id]/favicon/route');
    const res = await mod.GET(new Request('http://localhost/api/feeds/1001/favicon'), {
      params: Promise.resolve({ id: '1001' }),
    });
    const responseBody = Buffer.from(await res.arrayBuffer());
    const metadata = await sharp(responseBody).metadata();

    expect(res.headers.get('content-type')).toBe('image/webp');
    expect(metadata.width).toBe(32);
    expect(metadata.height).toBe(32);
    expect(responseBody.byteLength).toBeLessThan(ico.byteLength);
  });
});
