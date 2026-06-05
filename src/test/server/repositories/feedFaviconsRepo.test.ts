import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feedFaviconsRepo', () => {
  it('upserts successful favicon cache by user and feed id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/feeds/repositories/feedFaviconsRepo');

    await mod.upsertFeedFaviconCache(pool, {
      feedId: 'feed-1',
      sourceUrl: 'https://example.com/favicon.ico',
      contentType: 'image/x-icon',
      body: Buffer.from('ico'),
      userId: '2',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into feed_favicons');
    expect(sql).toContain('on conflict (user_id, feed_id) do update');
  });

  it('upserts favicon failure by user and feed id', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/feeds/repositories/feedFaviconsRepo');

    await mod.upsertFeedFaviconFailure(pool, {
      feedId: 'feed-1',
      failureReason: 'not_found',
      nextRetryAt: '2026-06-04T00:00:00.000Z',
      userId: '2',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into feed_favicons');
    expect(sql).toContain('on conflict (user_id, feed_id) do update');
  });
});
