import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { deleteUserAndOwnedData } from '@/server/domains/auth/services/userLifecycleService';

function createMockPool() {
  const client = {
    query: vi.fn(),
    release: vi.fn(),
  } as unknown as PoolClient & {
    query: ReturnType<typeof vi.fn>;
    release: ReturnType<typeof vi.fn>;
  };

  const pool = {
    connect: vi.fn().mockResolvedValue(client),
  } as unknown as Pool & {
    connect: ReturnType<typeof vi.fn>;
  };

  return { pool, client };
}

describe('userLifecycleService', () => {
  it('deletes user-owned data before deleting the user row', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 5 })
      .mockResolvedValueOnce({ rowCount: 3 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    const deleted = await deleteUserAndOwnedData(pool, '2');

    expect(deleted).toBe(true);
    expect(client.query).toHaveBeenNthCalledWith(1, 'begin');
    expect(client.query).toHaveBeenNthCalledWith(
      2,
      'delete from ai_digest_runs where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      3,
      'delete from feed_refresh_runs where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      4,
      'delete from fever_accounts where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      5,
      'delete from system_logs where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      6,
      'delete from feeds where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      7,
      'delete from categories where user_id = $1',
      ['2'],
    );
    expect(client.query).toHaveBeenNthCalledWith(
      8,
      expect.stringContaining('delete from users'),
      ['2'],
    );
    expect(client.query).toHaveBeenLastCalledWith('commit');
  });
});
