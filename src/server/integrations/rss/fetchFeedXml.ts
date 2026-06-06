import { fetchRssXml } from '@/server/infra/http/externalHttpClient';

export interface FetchFeedXmlResult {
  status: number;
  xml: string | null;
  etag: string | null;
  lastModified: string | null;
}

export interface FetchFeedXmlOptions {
  timeoutMs: number;
  userAgent: string;
  etag?: string | null;
  lastModified?: string | null;
  userId?: string | null;
}

export async function fetchFeedXml(
  url: string,
  options: FetchFeedXmlOptions,
): Promise<FetchFeedXmlResult> {
  const res = await fetchRssXml(url, {
    ...options,
    logging: {
      userId: options.userId ?? null,
      source: 'server/rss/fetchFeedXml',
      requestLabel: 'RSS fetch',
      context: {
        feedUrl: url,
      },
    },
  });

  return {
    status: res.status,
    xml: res.xml,
    etag: res.etag,
    lastModified: res.lastModified,
  };
}
