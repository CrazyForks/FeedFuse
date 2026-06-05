import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('feverSyncStatesRepo', () => {
  it('upserts sync state with user-scoped conflict handling', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/fever/repositories/feverSyncStatesRepo');

    await mod.upsertFeverSyncState(pool, {
      accountId: '1',
      lastIncrementalItemId: 'remote-item-1',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into fever_sync_states');
    expect(sql).toContain('on conflict (user_id, fever_account_id)');
    expect(sql).not.toContain('user_id = excluded.user_id');
  });
});
