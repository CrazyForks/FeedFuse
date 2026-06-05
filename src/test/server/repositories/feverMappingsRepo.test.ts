import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feverMappingsRepo', () => {
  it('upsertFeverFeedMapping writes account/feed composite conflict handling', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.upsertFeverFeedMapping(pool, {
      accountId: '1',
      feverFeedId: 'remote-feed-1',
      localFeedId: '10',
      remoteTitle: 'Feed',
      remoteUrl: 'https://example.com/feed.xml',
      remoteGroupName: null,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into fever_feed_mappings');
    expect(sql).toContain('on conflict (user_id, fever_account_id, fever_feed_id)');
    expect(sql).not.toContain('user_id = excluded.user_id');
  });

  it('upsertFeverItemMapping keeps conflict handling user scoped', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.upsertFeverItemMapping(pool, {
      accountId: '1',
      feverItemId: 'remote-item-1',
      feverFeedId: 'remote-feed-1',
      localFeedId: '10',
      localArticleId: '100',
      remoteIsRead: false,
      remoteIsSaved: false,
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into fever_item_mappings');
    expect(sql).toContain('on conflict (user_id, fever_account_id, fever_item_id)');
    expect(sql).not.toContain('user_id = excluded.user_id');
  });

  it('marks missing fever items inactive by seen ids', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 1 });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.markMissingFeverItemMappingsInactive(pool, {
      accountId: '1',
      seenRemoteItemIds: ['remote-2'],
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('update fever_item_mappings');
    expect(sql).toContain('user_id = $2');
    expect(sql).toContain("not (fever_item_id = any($3::text[]))");
  });

  it('gets fever account by local feed id only from enabled active mapping', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ feverAccountId: '1', localFeedId: '10' }] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.getFeverAccountByLocalFeedId(pool, '10');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from fever_feed_mappings');
    expect(sql).toContain('join fever_accounts fa on fa.id = fever_feed_mappings.fever_account_id');
    expect(sql).toContain('local_feed_id = $1');
    expect(sql).toContain('is_active = true');
    expect(sql).toContain('fa.enabled = true');
  });

  it('lists active local feed ids by fever account id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ localFeedId: '10' }, { localFeedId: '11' }] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    const result = await mod.listActiveLocalFeedIdsByFeverAccountId(pool, '1');

    expect(result).toEqual(['10', '11']);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('select distinct local_feed_id as "localFeedId"');
    expect(sql).toContain('fever_account_id = $1');
  });

  it('gets fever item mapping by local article id only from active mapping', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.getFeverItemMappingByLocalArticleId(pool, 'article-1');

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from fever_item_mappings');
    expect(sql).toContain('local_article_id = $1');
    expect(sql).toContain('and fim.is_active = true');
    expect(sql).toContain('join fever_feed_mappings');
    expect(sql).toContain('join fever_accounts fa');
    expect(sql).toContain('ffm.is_active = true');
    expect(sql).toContain('fa.enabled = true');
  });

  it('lists unread fever mappings only from active feeds on enabled accounts', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    await mod.listUnreadActiveFeverItemMappings(pool, { feedId: '10' });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from fever_item_mappings');
    expect(sql).toContain('join fever_feed_mappings ffm');
    expect(sql).toContain('join fever_accounts fa');
    expect(sql).toContain('ffm.is_active = true');
    expect(sql).toContain('fa.enabled = true');
  });

  it('checks whether a local article has any fever mapping', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ exists: true }] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    const result = await mod.hasAnyFeverItemMappingByLocalArticleId(pool, 'article-1');

    expect(result).toBe(true);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from fever_item_mappings');
    expect(sql).toContain('local_article_id = $1');
  });

  it('lists all fever mapped article ids for local mark-all exclusion', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [{ localArticleId: '100' }, { localArticleId: '101' }] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverMappingsRepo');

    const result = await mod.listAllFeverMappedArticleIds(pool, { feedId: '10' });

    expect(result).toEqual(['100', '101']);
    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('from fever_item_mappings');
    expect(sql).toContain('join articles on');
    expect(sql).toContain('articles.user_id = $1');
    expect(sql).toContain('articles.feed_id = $2');
  });

  it('builds local markAllRead SQL with excluded article ids when provided', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 2 });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await mod.markAllRead(pool as never, {
      feedId: '10',
      excludeArticleIds: ['100', '101'],
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('id <> all');
  });
});
