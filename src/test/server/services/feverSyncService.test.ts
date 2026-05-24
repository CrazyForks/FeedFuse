import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeverAuthError } from '@/server/integrations/fever/feverErrors';

const createFeedMock = vi.hoisted(() => vi.fn());
const createCategoryMock = vi.hoisted(() => vi.fn());
const findCategoryByNormalizedNameMock = vi.hoisted(() => vi.fn());
const getArticleByFeedAndDedupeKeyMock = vi.hoisted(() => vi.fn());
const getFeedByIdMock = vi.hoisted(() => vi.fn());
const getNextCategoryPositionMock = vi.hoisted(() => vi.fn());
const insertArticleIgnoreDuplicateMock = vi.hoisted(() => vi.fn());
const setArticleReadMock = vi.hoisted(() => vi.fn());
const setArticleStarredMock = vi.hoisted(() => vi.fn());
const updateFeedMock = vi.hoisted(() => vi.fn());
const getFeverFeedMappingByRemoteFeedIdMock = vi.hoisted(() => vi.fn());
const upsertFeverFeedMappingMock = vi.hoisted(() => vi.fn());
const upsertFeverItemMappingMock = vi.hoisted(() => vi.fn());
const markMissingFeverFeedMappingsInactiveMock = vi.hoisted(() => vi.fn());
const markMissingFeverItemMappingsInactiveMock = vi.hoisted(() => vi.fn());
const updateFeverAccountSyncStateMock = vi.hoisted(() => vi.fn());

function buildLocalFeed() {
  return {
    id: '10',
    kind: 'rss' as const,
    provider: 'fever' as const,
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
    articleListDisplayMode: 'card' as const,
    categoryId: null,
    fetchIntervalMinutes: 30,
    lastFetchStatus: null,
    lastFetchError: null,
    lastFetchRawError: null,
    isPodcast: false,
  };
}

vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  createFeed: (...args: unknown[]) => createFeedMock(...args),
  getFeedById: (...args: unknown[]) => getFeedByIdMock(...args),
  updateFeed: (...args: unknown[]) => updateFeedMock(...args),
}));

vi.mock('@/server/domains/feeds/repositories/categoriesRepo', () => ({
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  findCategoryByNormalizedName: (...args: unknown[]) => findCategoryByNormalizedNameMock(...args),
  getNextCategoryPosition: (...args: unknown[]) => getNextCategoryPositionMock(...args),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  insertArticleMediaAttachments: vi.fn(),
  getArticleByFeedAndDedupeKey: (...args: unknown[]) => getArticleByFeedAndDedupeKeyMock(...args),
  insertArticleIgnoreDuplicate: (...args: unknown[]) => insertArticleIgnoreDuplicateMock(...args),
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
}));

vi.mock('@/server/domains/fever/repositories/feverMappingsRepo', () => ({
  getFeverFeedMappingByRemoteFeedId: (...args: unknown[]) =>
    getFeverFeedMappingByRemoteFeedIdMock(...args),
  upsertFeverFeedMapping: (...args: unknown[]) => upsertFeverFeedMappingMock(...args),
  upsertFeverItemMapping: (...args: unknown[]) => upsertFeverItemMappingMock(...args),
  markMissingFeverFeedMappingsInactive: (...args: unknown[]) =>
    markMissingFeverFeedMappingsInactiveMock(...args),
  markMissingFeverItemMappingsInactive: (...args: unknown[]) =>
    markMissingFeverItemMappingsInactiveMock(...args),
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  updateFeverAccountSyncState: (...args: unknown[]) => updateFeverAccountSyncStateMock(...args),
}));

describe('feverSyncService', () => {
  beforeEach(() => {
    createFeedMock.mockReset();
    createCategoryMock.mockReset();
    findCategoryByNormalizedNameMock.mockReset();
    getArticleByFeedAndDedupeKeyMock.mockReset();
    getFeedByIdMock.mockReset();
    getNextCategoryPositionMock.mockReset();
    insertArticleIgnoreDuplicateMock.mockReset();
    setArticleReadMock.mockReset();
    setArticleStarredMock.mockReset();
    updateFeedMock.mockReset();
    getFeverFeedMappingByRemoteFeedIdMock.mockReset();
    upsertFeverFeedMappingMock.mockReset();
    upsertFeverItemMappingMock.mockReset();
    markMissingFeverFeedMappingsInactiveMock.mockReset();
    markMissingFeverItemMappingsInactiveMock.mockReset();
    updateFeverAccountSyncStateMock.mockReset();
  });

  it('projects remote feeds into local feeds and mappings', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue({ id: 'cat-tech', name: 'Tech', position: 0 });
    getFeverFeedMappingByRemoteFeedIdMock
      .mockResolvedValue({ localFeedId: '10' })
      .mockResolvedValueOnce(null);
    createFeedMock.mockResolvedValue({
      id: '10',
      provider: 'fever',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
    });
    insertArticleIgnoreDuplicateMock
      .mockResolvedValueOnce({ id: '100' })
      .mockResolvedValueOnce({ id: '101' });

    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');
    const pool = {} as never;
    const client = {
      listFeeds: vi.fn().mockResolvedValue([
        {
          id: 'feed-1',
          title: 'Feed',
          url: 'https://example.com/feed.xml',
          siteUrl: null,
          faviconId: null,
          groupName: 'Tech',
        },
      ]),
      listItems: vi.fn().mockResolvedValue([
        { id: 'item-1', feedId: 'feed-1', title: 'Hello', author: null, html: null, url: 'https://example.com/1', createdAt: null, isRead: false, isSaved: false },
        { id: 'item-2', feedId: 'feed-1', title: 'World', author: null, html: null, url: 'https://example.com/2', createdAt: null, isRead: true, isSaved: false },
      ]),
    };

    const result = await syncFeverAccount(pool, {
      accountId: '1',
      client,
    });

    expect(result.createdFeeds).toBe(1);
    expect(result.createdArticles).toBe(2);
    expect(createFeedMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        categoryId: 'cat-tech',
        siteUrl: 'https://example.com',
        iconUrl: null,
      }),
    );
    expect(updateFeedMock).toHaveBeenCalledWith(
      pool,
      '10',
      { iconUrl: '/api/feeds/10/favicon' },
    );
    expect(upsertFeverFeedMappingMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        localFeedId: '10',
        remoteGroupName: 'Tech',
        remoteFaviconUrl: '/api/feeds/10/favicon',
      }),
    );
    expect(upsertFeverItemMappingMock).toHaveBeenCalledTimes(2);
  });

  it('backfills favicon route when the projected local feed already exists', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue({ id: 'cat-tech', name: 'Tech', position: 0 });
    getFeedByIdMock.mockResolvedValue({
      id: '10',
      kind: 'rss',
      provider: 'fever',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      siteUrl: null,
      iconUrl: null,
      enabled: true,
      fullTextOnOpenEnabled: false,
      fullTextOnFetchEnabled: false,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: false,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: null,
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
      lastFetchRawError: null,
      isPodcast: false,
    });
    updateFeedMock.mockResolvedValue({
      id: '10',
      kind: 'rss',
      provider: 'fever',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
      siteUrl: 'https://example.com',
      iconUrl: '/api/feeds/10/favicon',
      enabled: true,
      fullTextOnOpenEnabled: false,
      fullTextOnFetchEnabled: false,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: false,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: 'cat-tech',
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
      lastFetchRawError: null,
      isPodcast: false,
    });
    getFeverFeedMappingByRemoteFeedIdMock.mockResolvedValue({ localFeedId: '10' });

    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');

    await syncFeverAccount({} as never, {
      accountId: '1',
      client: {
        listFeeds: vi.fn().mockResolvedValue([
          {
            id: 'feed-1',
            title: 'Feed',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://example.com',
            faviconId: null,
            groupName: 'Tech',
          },
        ]),
        listItems: vi.fn().mockResolvedValue([]),
      },
    });

    expect(updateFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      '10',
      expect.objectContaining({
        title: 'Feed',
        url: 'https://example.com/feed.xml',
        categoryId: 'cat-tech',
        siteUrl: 'https://example.com',
        iconUrl: '/api/feeds/10/favicon',
      }),
    );
    expect(upsertFeverFeedMappingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        localFeedId: '10',
        remoteGroupName: 'Tech',
        remoteFaviconUrl: '/api/feeds/10/favicon',
      }),
    );
  });

  it('updates projected feed title and url when remote feed metadata changes', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue({ id: 'cat-tech', name: 'Tech', position: 0 });
    getFeedByIdMock.mockResolvedValue({
      id: '10',
      kind: 'rss',
      provider: 'fever',
      title: 'Old title',
      url: 'https://example.com/old.xml',
      siteUrl: 'https://example.com',
      iconUrl: '/api/feeds/10/favicon',
      enabled: true,
      fullTextOnOpenEnabled: false,
      fullTextOnFetchEnabled: false,
      aiSummaryOnOpenEnabled: false,
      aiSummaryOnFetchEnabled: false,
      bodyTranslateOnFetchEnabled: false,
      bodyTranslateOnOpenEnabled: false,
      titleTranslateEnabled: false,
      bodyTranslateEnabled: false,
      articleListDisplayMode: 'card',
      categoryId: 'cat-tech',
      fetchIntervalMinutes: 30,
      lastFetchStatus: null,
      lastFetchError: null,
      lastFetchRawError: null,
      isPodcast: false,
    });
    updateFeedMock.mockResolvedValue(buildLocalFeed());
    getFeverFeedMappingByRemoteFeedIdMock.mockResolvedValue({ localFeedId: '10' });

    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');

    await syncFeverAccount({} as never, {
      accountId: '1',
      client: {
        listFeeds: vi.fn().mockResolvedValue([
          {
            id: 'feed-1',
            title: 'New title',
            url: 'https://example.com/new.xml',
            siteUrl: 'https://example.com',
            faviconId: null,
            groupName: 'Tech',
          },
        ]),
        listItems: vi.fn().mockResolvedValue([]),
      },
    });

    expect(updateFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      '10',
      expect.objectContaining({
        title: 'New title',
        url: 'https://example.com/new.xml',
      }),
    );
  });

  it('does not mark missing remote items inactive during incremental sync', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue({ id: 'cat-tech', name: 'Tech', position: 0 });
    getFeverFeedMappingByRemoteFeedIdMock.mockResolvedValue({ localFeedId: '10' });
    getFeedByIdMock.mockResolvedValue(buildLocalFeed());
    insertArticleIgnoreDuplicateMock.mockResolvedValue({ id: 'article-1' });
    getArticleByFeedAndDedupeKeyMock.mockResolvedValue(null);

    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');

    await syncFeverAccount({} as never, {
      accountId: '1',
      client: {
        listFeeds: vi.fn().mockResolvedValue([
          {
            id: 'feed-1',
            title: 'Feed',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://example.com',
            faviconId: null,
            groupName: 'Tech',
          },
        ]),
        listItems: vi.fn().mockResolvedValue([
          {
            id: 'remote-2',
            feedId: 'feed-1',
            title: 'Hello',
            url: 'https://example.com/post',
            author: null,
            html: null,
            createdAt: null,
            isRead: false,
            isSaved: false,
          },
        ]),
      },
    });

    expect(markMissingFeverItemMappingsInactiveMock).not.toHaveBeenCalled();
  });

  it('creates local category when remote fever group does not exist yet', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue(null);
    getNextCategoryPositionMock.mockResolvedValue(2);
    createCategoryMock.mockResolvedValue({ id: 'cat-news', name: 'News', position: 2 });
    getFeverFeedMappingByRemoteFeedIdMock.mockResolvedValue(null);
    createFeedMock.mockResolvedValue({
      id: '10',
      provider: 'fever',
      title: 'Feed',
      url: 'https://example.com/feed.xml',
    });

    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');

    await syncFeverAccount({} as never, {
      accountId: '1',
      client: {
        listFeeds: vi.fn().mockResolvedValue([
          {
            id: 'feed-1',
            title: 'Feed',
            url: 'https://example.com/feed.xml',
            siteUrl: 'https://example.com',
            faviconId: null,
            groupName: 'News',
          },
        ]),
        listItems: vi.fn().mockResolvedValue([]),
      },
    });

    expect(getNextCategoryPositionMock).toHaveBeenCalled();
    expect(createCategoryMock).toHaveBeenCalledWith(
      expect.anything(),
      { name: 'News', position: 2 },
    );
    expect(createFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ categoryId: 'cat-news' }),
    );
  });

  it('marks missing remote items inactive during full sync', async () => {
    const { reconcileFeverItems } = await import('@/server/domains/fever/services/feverSyncService');

    await reconcileFeverItems({} as never, {
      accountId: '1',
      seenRemoteItemIds: ['remote-2'],
    });

    expect(markMissingFeverItemMappingsInactiveMock).toHaveBeenCalledWith(
      expect.anything(),
      { accountId: '1', seenRemoteItemIds: ['remote-2'] },
    );
  });

  it('creates projected articles with remote read and saved state', async () => {
    insertArticleIgnoreDuplicateMock.mockResolvedValue({ id: 'article-1' });
    getArticleByFeedAndDedupeKeyMock.mockResolvedValue(null);

    const { projectFeverItem } = await import('@/server/domains/fever/services/feverSyncService');

    await projectFeverItem({} as never, {
      accountId: '1',
      localFeed: buildLocalFeed(),
      remoteItem: {
        id: 'remote-1',
        feedId: 'feed-1',
        title: 'Hello',
        url: 'https://example.com/post',
        author: null,
        html: '<p>hello</p>',
        createdAt: null,
        isRead: true,
        isSaved: false,
      },
    });

    expect(insertArticleIgnoreDuplicateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        title: 'Hello',
        link: 'https://example.com/post',
      }),
    );
    expect(setArticleReadMock).toHaveBeenCalledWith(expect.anything(), 'article-1', true);
    expect(setArticleStarredMock).toHaveBeenCalledWith(expect.anything(), 'article-1', false);
  });

  it('passes normalized ISO createdAt into article and mapping writes', async () => {
    insertArticleIgnoreDuplicateMock.mockResolvedValue({ id: 'article-1' });
    getArticleByFeedAndDedupeKeyMock.mockResolvedValue(null);

    const { projectFeverItem } = await import('@/server/domains/fever/services/feverSyncService');

    await projectFeverItem({} as never, {
      accountId: '1',
      localFeed: buildLocalFeed(),
      remoteItem: {
        id: 'remote-1',
        feedId: 'feed-1',
        title: 'Hello',
        url: 'https://example.com/post',
        author: null,
        html: '<p>hello</p>',
        createdAt: '2026-05-22T18:05:00.000Z',
        isRead: true,
        isSaved: false,
      },
    });

    expect(insertArticleIgnoreDuplicateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        publishedAt: '2026-05-22T18:05:00.000Z',
      }),
    );
    expect(upsertFeverItemMappingMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        remoteCreatedAt: '2026-05-22T18:05:00.000Z',
      }),
    );
  });

  it('reuses existing projected article when duplicate sync hits the same dedupe key', async () => {
    insertArticleIgnoreDuplicateMock.mockResolvedValue(null);
    getArticleByFeedAndDedupeKeyMock.mockResolvedValue({ id: 'article-existing' });

    const { projectFeverItem } = await import('@/server/domains/fever/services/feverSyncService');
    const result = await projectFeverItem({} as never, {
      accountId: '1',
      localFeed: buildLocalFeed(),
      remoteItem: {
        id: 'remote-1',
        feedId: 'feed-1',
        title: 'Hello',
        url: 'https://example.com/post',
        author: null,
        html: '<p>hello</p>',
        createdAt: '2026-05-22T10:05:00.000Z',
        isRead: true,
        isSaved: false,
      },
    });

    expect(getArticleByFeedAndDedupeKeyMock).toHaveBeenCalledWith(
      expect.anything(),
      { feedId: '10', dedupeKey: 'fever:1:remote-1' },
    );
    expect(result).toEqual({ articleId: 'article-existing', created: false });
    expect(setArticleReadMock).toHaveBeenCalledWith(expect.anything(), 'article-existing', true);
    expect(setArticleStarredMock).toHaveBeenCalledWith(expect.anything(), 'article-existing', false);
  });

  it('keeps new fever articles pending and calls onCreated for downstream filter pipeline', async () => {
    insertArticleIgnoreDuplicateMock.mockResolvedValue({ id: 'article-1' });
    const onCreated = vi.fn().mockResolvedValue(undefined);

    const { projectFeverItem } = await import('@/server/domains/fever/services/feverSyncService');

    await projectFeverItem({} as never, {
      accountId: '1',
      localFeed: buildLocalFeed(),
      remoteItem: {
        id: 'remote-1',
        feedId: 'feed-1',
        title: 'Hello',
        url: 'https://example.com/post',
        author: null,
        html: '<p>hello</p>',
        createdAt: '2026-05-22T10:05:00.000Z',
        isRead: false,
        isSaved: false,
      },
      projectedArticle: {
        title: 'Hello',
        link: 'https://example.com/post',
        author: null,
        publishedAt: '2026-05-22T10:05:00.000Z',
        contentHtml: '<p>clean</p>',
        summary: 'summary',
        sourceLanguage: 'en',
        previewImageUrl: 'https://example.com/cover.jpg',
        mediaAttachments: [],
        isPodcastSource: false,
      },
      onCreated,
    });

    expect(insertArticleIgnoreDuplicateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        contentHtml: '<p>clean</p>',
        summary: 'summary',
        sourceLanguage: 'en',
        previewImageUrl: 'https://example.com/cover.jpg',
        filterStatus: 'pending',
        isFiltered: false,
        filteredBy: [],
        filterEvaluatedAt: null,
      }),
    );
    expect(onCreated).toHaveBeenCalledWith({
      articleId: 'article-1',
      feed: buildLocalFeed(),
    });
  });

  it('stores sync error on account state when fever fetch fails', async () => {
    const { syncFeverAccount } = await import('@/server/domains/fever/services/feverSyncService');

    await expect(
      syncFeverAccount({} as never, {
        accountId: '1',
        client: {
          listFeeds: vi.fn().mockRejectedValue(new FeverAuthError()),
          listItems: vi.fn(),
        } as never,
      }),
    ).rejects.toMatchObject({ code: 'fever_auth_failed' });

    expect(updateFeverAccountSyncStateMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        accountId: '1',
        lastError: 'Fever 认证失败',
      }),
    );
  });
});
