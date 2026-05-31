import { describe, expect, it, vi } from 'vitest';

describe('podcast feed ingestion', () => {
  it('stores media attachments and skips article filtering for podcast feeds', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn() }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        userId: '1',
        url: 'https://pod.example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'Podcast',
        link: 'https://pod.example.com',
        language: 'en',
        items: [
          {
            title: 'Episode 1',
            link: 'https://pod.example.com/1',
            guid: 'episode-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Episode</p>',
            previewImage: null,
            summary: 'Episode summary',
            mediaAttachments: [
              {
                url: 'https://pod.example.com/1.mp3',
                mimeType: 'audio/mpeg',
                sizeBytes: 123,
                durationSeconds: 456,
              },
            ],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).toHaveBeenCalledWith(
      expect.anything(),
      'article-1',
      [
        {
          url: 'https://pod.example.com/1.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: 123,
          durationSeconds: 456,
        },
      ],
      '1',
    );
    expect(boss.send).not.toHaveBeenCalled();
    expect(deps.insertArticleIgnoreDuplicate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: '1',
        filterStatus: 'passed',
        isFiltered: false,
        filteredBy: [],
        filterEvaluatedAt: expect.any(String),
      }),
    );
  });

  it('keeps normal RSS feeds on the article filter queue', async () => {
    const boss = { send: vi.fn().mockResolvedValue('job-1') };
    const deps = {
      getPool: () => ({ query: vi.fn() }),
      getFeedForFetch: vi.fn().mockResolvedValue({
        id: 'feed-1',
        userId: '1',
        url: 'https://example.com/rss.xml',
        enabled: true,
        etag: null,
        lastModified: null,
        lastFetchedAt: null,
        fetchIntervalMinutes: 30,
        fullTextOnFetchEnabled: true,
        aiSummaryOnFetchEnabled: true,
        bodyTranslateOnFetchEnabled: true,
        titleTranslateEnabled: true,
      }),
      isSafeExternalUrl: vi.fn().mockResolvedValue(true),
      getAppSettings: vi.fn().mockResolvedValue({
        rssTimeoutMs: 10000,
        rssUserAgent: 'FeedFuse/1.0',
      }),
      getUiSettings: vi.fn().mockResolvedValue({}),
      fetchFeedXml: vi.fn().mockResolvedValue({
        status: 200,
        etag: null,
        lastModified: null,
        xml: '<rss />',
      }),
      parseFeed: vi.fn().mockResolvedValue({
        title: 'RSS',
        link: 'https://example.com',
        language: 'en',
        items: [
          {
            title: 'Article 1',
            link: 'https://example.com/1',
            guid: 'article-1',
            author: null,
            publishedAt: new Date('2026-05-16T00:00:00Z'),
            contentHtml: '<p>Article</p>',
            previewImage: null,
            summary: 'Article summary',
            mediaAttachments: [],
          },
        ],
      }),
      sanitizeContent: vi.fn((html: string | null) => html),
      insertArticleIgnoreDuplicate: vi.fn().mockResolvedValue({ id: 'article-1' }),
      insertArticleMediaAttachments: vi.fn().mockResolvedValue(undefined),
      pruneFeedArticlesToLimit: vi.fn().mockResolvedValue({ deletedCount: 0 }),
      recordFeedFetchResult: vi.fn().mockResolvedValue(undefined),
      isFeedDue: vi.fn().mockReturnValue(true),
    };

    const { fetchAndIngestFeed } = await import('../../worker/index');
    const result = await fetchAndIngestFeed(boss as never, 'feed-1', { deps });

    expect(result).toEqual({ inserted: 1, errorMessage: null });
    expect(deps.insertArticleMediaAttachments).not.toHaveBeenCalled();
    expect(boss.send).toHaveBeenCalledWith(
      'article.filter',
      expect.objectContaining({ userId: '1', articleId: 'article-1' }),
      expect.any(Object),
    );
  });
});
