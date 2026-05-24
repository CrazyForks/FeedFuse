import { beforeEach, describe, expect, it, vi } from 'vitest';

const getFeverItemMappingByLocalArticleIdMock = vi.hoisted(() => vi.fn());
const getFeverAccountByIdMock = vi.hoisted(() => vi.fn());
const createFeverClientMock = vi.hoisted(() => vi.fn());
const setArticleReadMock = vi.hoisted(() => vi.fn());
const setArticleStarredMock = vi.hoisted(() => vi.fn());
const markAllReadMock = vi.hoisted(() => vi.fn());
const listUnreadActiveFeverItemMappingsMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/fever/repositories/feverMappingsRepo', () => ({
  getFeverItemMappingByLocalArticleId: (...args: unknown[]) =>
    getFeverItemMappingByLocalArticleIdMock(...args),
  listUnreadActiveFeverItemMappings: (...args: unknown[]) =>
    listUnreadActiveFeverItemMappingsMock(...args),
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  getFeverAccountById: (...args: unknown[]) => getFeverAccountByIdMock(...args),
}));

vi.mock('@/server/integrations/fever/feverClient', () => ({
  createFeverClient: (...args: unknown[]) => createFeverClientMock(...args),
}));

vi.mock('@/server/domains/articles/repositories/articlesRepo', () => ({
  setArticleRead: (...args: unknown[]) => setArticleReadMock(...args),
  setArticleStarred: (...args: unknown[]) => setArticleStarredMock(...args),
  markAllRead: (...args: unknown[]) => markAllReadMock(...args),
}));

describe('feverWritebackService', () => {
  beforeEach(() => {
    getFeverItemMappingByLocalArticleIdMock.mockReset();
    getFeverAccountByIdMock.mockReset();
    createFeverClientMock.mockReset();
    setArticleReadMock.mockReset();
    setArticleStarredMock.mockReset();
    markAllReadMock.mockReset();
    listUnreadActiveFeverItemMappingsMock.mockReset();
  });

  it('writes fever read state remotely before committing local update', async () => {
    const markItemMock = vi.fn().mockResolvedValue(undefined);
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue({
      feverAccountId: '10',
      feverItemId: 'remote-1',
    });
    getFeverAccountByIdMock.mockResolvedValue({
      id: '10',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    createFeverClientMock.mockReturnValue({ markItem: markItemMock });

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');
    const pool = {} as never;

    await updateArticleStateWithWriteback(pool, {
      articleId: '1',
      isRead: true,
    });

    expect(markItemMock).toHaveBeenCalledWith({
      itemId: 'remote-1',
      as: 'read',
    });
    expect(setArticleReadMock).toHaveBeenCalledWith(pool, '1', true);
  });

  it('does not commit local state when fever writeback fails', async () => {
    const markItemMock = vi.fn().mockRejectedValueOnce(new Error('boom'));
    getFeverItemMappingByLocalArticleIdMock.mockResolvedValue({
      feverAccountId: '10',
      feverItemId: 'remote-1',
    });
    getFeverAccountByIdMock.mockResolvedValue({
      id: '10',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    createFeverClientMock.mockReturnValue({ markItem: markItemMock });

    const { updateArticleStateWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');

    await expect(
      updateArticleStateWithWriteback({} as never, { articleId: '1', isStarred: true }),
    ).rejects.toThrow('boom');

    expect(setArticleStarredMock).not.toHaveBeenCalled();
  });

  it('writes active fever unread items back before local markAllRead fallback', async () => {
    const markItemMock = vi.fn().mockResolvedValue(undefined);
    listUnreadActiveFeverItemMappingsMock.mockResolvedValue([
      {
        feverAccountId: '10',
        feverItemId: 'remote-1',
        localArticleId: 'article-1',
      },
      {
        feverAccountId: '10',
        feverItemId: 'remote-2',
        localArticleId: 'article-2',
      },
    ]);
    getFeverAccountByIdMock.mockResolvedValue({
      id: '10',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    createFeverClientMock.mockReturnValue({ markItem: markItemMock });
    markAllReadMock.mockResolvedValue(1);

    const { markAllArticlesReadWithWriteback } = await import('@/server/domains/fever/services/feverWritebackService');

    await expect(markAllArticlesReadWithWriteback({} as never, { feedId: 'feed-1' })).resolves.toBe(1);
    expect(markItemMock).toHaveBeenNthCalledWith(1, {
      itemId: 'remote-1',
      as: 'read',
    });
    expect(markItemMock).toHaveBeenNthCalledWith(2, {
      itemId: 'remote-2',
      as: 'read',
    });
    expect(setArticleReadMock).toHaveBeenNthCalledWith(1, expect.anything(), 'article-1', true);
    expect(setArticleReadMock).toHaveBeenNthCalledWith(2, expect.anything(), 'article-2', true);
    expect(markAllReadMock).toHaveBeenCalledWith(expect.anything(), { feedId: 'feed-1' });
  });
});
