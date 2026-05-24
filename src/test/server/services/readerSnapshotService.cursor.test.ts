import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

const listCategoriesMock = vi.fn();
const listFeedsMock = vi.fn();

vi.mock('@/server/domains/feeds/repositories/categoriesRepo', () => ({
  listCategories: (...args: unknown[]) => listCategoriesMock(...args),
}));

vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  listFeeds: (...args: unknown[]) => listFeedsMock(...args),
}));

describe('readerSnapshotService (cursor)', () => {
  beforeEach(() => {
    listCategoriesMock.mockReset();
    listFeedsMock.mockReset();
  });

  it('qualifies article id in snapshot ordering when joining ai summary sessions', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/reader/services/readerSnapshotService')) as typeof import('@/server/domains/reader/services/readerSnapshotService');
    await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    const articleQuerySql = query.mock.calls
      .map(([statement]) => String(statement ?? ''))
      .find((statement) => statement.includes('left join lateral'));

    expect(articleQuerySql).toContain('order by "sortPublishedAt" desc, articles.id desc');
  });

  it('qualifies article id in cursor pagination filters for load-more requests', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/reader/services/readerSnapshotService')) as typeof import('@/server/domains/reader/services/readerSnapshotService');
    await mod.getReaderSnapshot(pool, {
      view: 'all',
      limit: 1,
      cursor: mod.encodeCursor({
        publishedAt: '2026-03-08T00:00:00.000Z',
        id: 'art-1',
      }),
    });

    const articleQuerySql = query.mock.calls
      .map(([statement]) => String(statement ?? ''))
      .find((statement) => statement.includes('left join lateral'));

    expect(articleQuerySql).toContain(
      `(coalesce(published_at, 'epoch'::timestamptz), articles.id) < ($2, $3)`,
    );
  });

  it('emits an ISO cursor when pg returns Date objects for sortPublishedAt', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'art-1',
            feedId: 'feed-1',
            title: 'First',
            titleOriginal: 'First',
            titleZh: null,
            summary: null,
            previewImage: null,
            author: null,
            publishedAt: '2026-03-09T00:00:00.000Z',
            link: 'https://example.com/articles/1',
            filterStatus: 'passed',
            isFiltered: false,
            filteredBy: [],
            sourceLanguage: 'en',
            contentHtml: '<p>First</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: new Date('2026-03-09T00:00:00.000Z'),
          },
          {
            id: 'art-2',
            feedId: 'feed-1',
            title: 'Second',
            titleOriginal: 'Second',
            titleZh: null,
            summary: null,
            previewImage: null,
            author: null,
            publishedAt: '2026-03-08T00:00:00.000Z',
            link: 'https://example.com/articles/2',
            filterStatus: 'passed',
            isFiltered: false,
            filteredBy: [],
            sourceLanguage: 'en',
            contentHtml: '<p>Second</p>',
            contentFullHtml: null,
            isRead: false,
            isStarred: false,
            sortPublishedAt: new Date('2026-03-08T00:00:00.000Z'),
          },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ totalCount: 2 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/reader/services/readerSnapshotService')) as typeof import('@/server/domains/reader/services/readerSnapshotService');
    const snapshot = await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    expect(mod.decodeCursor(snapshot.articles.nextCursor)).toEqual({
      publishedAt: '2026-03-08T00:00:00.000Z',
      id: 'art-2',
    });
  });

  it('filters inactive fever items from unread counts and total counts', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/reader/services/readerSnapshotService')) as typeof import('@/server/domains/reader/services/readerSnapshotService');
    await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    const sqlStatements = query.mock.calls.map(([statement]) => String(statement ?? ''));
    const unreadSql = sqlStatements.find((statement) => statement.includes('count(*)::int as "unreadCount"'));
    const totalCountSql = sqlStatements.find((statement) => statement.includes('count(*)::int as "totalCount"'));

    expect(unreadSql).toContain('not exists');
    expect(unreadSql).toContain('from fever_item_mappings fim');
    expect(totalCountSql).toContain('not exists');
    expect(totalCountSql).toContain('from fever_item_mappings fim');
  });

  it('filters articles whose fever feed mapping is inactive', async () => {
    listCategoriesMock.mockResolvedValue([]);
    listFeedsMock.mockResolvedValue([]);

    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ totalCount: 0 }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/reader/services/readerSnapshotService')) as typeof import('@/server/domains/reader/services/readerSnapshotService');
    await mod.getReaderSnapshot(pool, { view: 'all', limit: 1 });

    const sqlStatements = query.mock.calls.map(([statement]) => String(statement ?? ''));
    const articleSql = sqlStatements.find((statement) => statement.includes('left join lateral'));
    const unreadSql = sqlStatements.find((statement) => statement.includes('count(*)::int as "unreadCount"'));
    const totalCountSql = sqlStatements.find((statement) => statement.includes('count(*)::int as "totalCount"'));

    expect(articleSql).toContain('from fever_feed_mappings ffm');
    expect(articleSql).toContain('ffm.is_active = false');
    expect(unreadSql).toContain('from fever_feed_mappings ffm');
    expect(totalCountSql).toContain('from fever_feed_mappings ffm');
  });
});
