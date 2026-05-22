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
    expect(sql).toContain('on conflict (fever_account_id, fever_feed_id)');
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
    expect(sql).toContain("not (fever_item_id = any($2::text[]))");
  });
});
