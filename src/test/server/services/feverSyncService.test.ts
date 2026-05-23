import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FeverAuthError } from '@/server/integrations/fever/feverErrors';

const createFeedMock = vi.hoisted(() => vi.fn());
const getArticleByFeedAndDedupeKeyMock = vi.hoisted(() => vi.fn());
const getFeedByUrlMock = vi.hoisted(() => vi.fn());
const insertArticleIgnoreDuplicateMock = vi.hoisted(() => vi.fn());
const setArticleReadMock = vi.hoisted(() => vi.fn());
const setArticleStarredMock = vi.hoisted(() => vi.fn());
const getFeverFeedMappingByRemoteFeedIdMock = vi.hoisted(() => vi.fn());
const upsertFeverFeedMappingMock = vi.hoisted(() => vi.fn());
const upsertFeverItemMappingMock = vi.hoisted(() => vi.fn());
const markMissingFeverFeedMappingsInactiveMock = vi.hoisted(() => vi.fn());
const markMissingFeverItemMappingsInactiveMock = vi.hoisted(() => vi.fn());
const updateFeverAccountSyncStateMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  createFeed: (...args: unknown[]) => createFeedMock(...args),
  getFeedByUrl: (...args: unknown[]) => getFeedByUrlMock(...args),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
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
    getArticleByFeedAndDedupeKeyMock.mockReset();
    getFeedByUrlMock.mockReset();
    insertArticleIgnoreDuplicateMock.mockReset();
    setArticleReadMock.mockReset();
    setArticleStarredMock.mockReset();
    getFeverFeedMappingByRemoteFeedIdMock.mockReset();
    upsertFeverFeedMappingMock.mockReset();
    upsertFeverItemMappingMock.mockReset();
    markMissingFeverFeedMappingsInactiveMock.mockReset();
    markMissingFeverItemMappingsInactiveMock.mockReset();
    updateFeverAccountSyncStateMock.mockReset();
  });

  it('projects remote feeds into local feeds and mappings', async () => {
    getFeedByUrlMock.mockResolvedValue(null);
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
        { id: 'feed-1', title: 'Feed', url: 'https://example.com/feed.xml', siteUrl: null, faviconId: null },
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
    expect(upsertFeverFeedMappingMock).toHaveBeenCalled();
    expect(upsertFeverItemMappingMock).toHaveBeenCalledTimes(2);
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
      localFeedId: '10',
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
      localFeedId: '10',
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
      localFeedId: '10',
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
