import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientForAccountMock = vi.hoisted(() => vi.fn());
const syncFeverAccountMock = vi.hoisted(() => vi.fn());
const getFeverSyncStateMock = vi.hoisted(() => vi.fn());
const upsertFeverSyncStateMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/fever/services/feverWritebackService', () => ({
  createClientForAccount: (...args: unknown[]) => createClientForAccountMock(...args),
}));

vi.mock('@/server/domains/fever/services/feverSyncService', () => ({
  syncFeverAccount: (...args: unknown[]) => syncFeverAccountMock(...args),
}));

vi.mock('@/server/domains/fever/repositories/feverSyncStatesRepo', () => ({
  getFeverSyncStateByAccountId: (...args: unknown[]) => getFeverSyncStateMock(...args),
  upsertFeverSyncState: (...args: unknown[]) => upsertFeverSyncStateMock(...args),
}));

describe('feverSync worker', () => {
  beforeEach(() => {
    vi.resetModules();
    createClientForAccountMock.mockReset();
    syncFeverAccountMock.mockReset();
    getFeverSyncStateMock.mockReset();
    upsertFeverSyncStateMock.mockReset();
  });

  it('runs fever sync worker with account id', async () => {
    const pool = {} as never;
    const client = { listFeeds: vi.fn(), listItems: vi.fn(), markItem: vi.fn() };
    const boss = { send: vi.fn() };
    const getAppSettings = vi.fn().mockResolvedValue({
      rssTimeoutMs: 10000,
      rssUserAgent: 'FeedFuse/1.0',
    });
    const fetchFeedXml = vi.fn().mockResolvedValue({
      status: 200,
      xml: '<rss />',
      etag: null,
      lastModified: null,
    });
    createClientForAccountMock.mockResolvedValue(client);
    getFeverSyncStateMock.mockResolvedValue({
      feverAccountId: '1',
      lastIncrementalItemId: 'remote-9',
      lastIncrementalSyncedAt: '2026-05-22T00:00:00.000Z',
      lastFullSyncAt: null,
      lastError: null,
      updatedAt: '2026-05-22T00:00:00.000Z',
    });
    syncFeverAccountMock.mockResolvedValue({
      createdFeeds: 0,
      createdArticles: 1,
      items: [{ id: 'remote-1' }],
    });

    const { runFeverSyncWorker } = await import('@/worker/feverSync');
    await runFeverSyncWorker({
      pool,
      boss: boss as never,
      data: { accountId: '1', runId: 'run-1', feedIds: ['10'] },
      deps: {
        getAppSettings,
        getUiSettings: vi.fn().mockResolvedValue({
          rss: {
            articleFilter: {
              keyword: { enabled: true, keywords: ['Sponsored'] },
              ai: { enabled: false, prompt: '' },
            },
          },
        }),
        fetchFeedXml,
        parseFeed: vi.fn().mockResolvedValue({
          title: 'Feed',
          link: 'https://example.com',
          language: 'en',
          items: [
            {
              title: 'Hello',
              link: 'https://example.com/post',
              guid: 'guid-1',
              author: null,
              publishedAt: new Date('2026-05-22T10:05:00.000Z'),
              contentHtml: '<p>hello</p>',
              previewImage: 'https://example.com/cover.jpg',
              summary: 'summary',
              mediaAttachments: [],
            },
          ],
        }),
        sanitizeContent: vi.fn().mockReturnValue('<p>clean</p>'),
      },
    });

    expect(createClientForAccountMock).toHaveBeenCalledWith(pool, '1');
    expect(syncFeverAccountMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        accountId: '1',
        client,
        sinceItemId: 'remote-9',
      }),
    );
    expect(syncFeverAccountMock.mock.calls[0]?.[1]).not.toHaveProperty('targetLocalFeedIds');

    const syncInput = syncFeverAccountMock.mock.calls[0]?.[1];
    const feed = {
      id: '10',
      kind: 'rss',
      provider: 'fever',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
      iconUrl: null,
      enabled: true,
      fullTextOnOpenEnabled: false,
      fullTextOnFetchEnabled: true,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: true,
      bodyTranslateOnFetchEnabled: true,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: true,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: null,
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
      lastFetchRawError: null,
      isPodcast: false,
    };
    const remoteFeed = {
      id: 'feed-1',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
      faviconId: null,
      groupName: null,
    };
    const remoteItem = {
      id: 'remote-1',
      feedId: 'feed-1',
      title: 'Hello',
      author: null,
      html: '<p>remote</p>',
      url: 'https://example.com/post',
      createdAt: '2026-05-22T10:05:00.000Z',
      isRead: false,
      isSaved: false,
    };

    await expect(syncInput.resolveArticleProjection({ remoteFeed, localFeed: feed, remoteItem })).resolves.toEqual(
      expect.objectContaining({
        title: 'Hello',
        contentHtml: '<p>clean</p>',
        summary: 'summary',
        sourceLanguage: 'en',
        previewImageUrl: 'https://example.com/cover.jpg',
        isPodcastSource: false,
      }),
    );
    await syncInput.resolveArticleProjection({ remoteFeed, localFeed: feed, remoteItem });
    expect(getAppSettings).toHaveBeenCalledTimes(1);
    expect(fetchFeedXml).toHaveBeenCalledTimes(1);

    await syncInput.onArticleCreated({ articleId: 'article-1', feed });
    expect(boss.send).toHaveBeenCalledWith(
      'article.filter',
      expect.objectContaining({
        articleId: 'article-1',
        feed: expect.objectContaining({
          fullTextOnFetchEnabled: true,
          aiSummaryOnFetchEnabled: true,
          bodyTranslateOnFetchEnabled: true,
          titleTranslateEnabled: true,
        }),
      }),
      expect.any(Object),
    );

    // 增量同步成功后要推进游标，后续调度才能真正复用 since_id。
    expect(upsertFeverSyncStateMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        accountId: '1',
        lastIncrementalItemId: 'remote-1',
      }),
    );
  });
});
