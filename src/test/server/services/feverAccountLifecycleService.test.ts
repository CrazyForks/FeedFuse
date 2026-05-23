import type { Pool, PoolClient } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import { deleteFeverAccountAndSources } from '@/server/domains/fever/services/feverAccountLifecycleService';

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

describe('feverAccountLifecycleService', () => {
  it('deletes mapped local fever feeds, cleans empty categories, then deletes the account', async () => {
    const { pool, client } = createMockPool();

    client.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({ rows: [{ localFeedId: '10' }, { localFeedId: '11' }] })
      .mockResolvedValueOnce({ rows: [{ id: '10', categoryId: 'cat-fever', siteUrl: null }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: '11', categoryId: 'cat-empty', siteUrl: null }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rows: [{ count: 0 }] })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce(undefined);

    const deleted = await deleteFeverAccountAndSources(pool, '1');

    expect(deleted).toBe(true);
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('select distinct local_feed_id as "localFeedId"'),
      ['1'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from feeds where id = $1'),
      ['10'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from feeds where id = $1'),
      ['11'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from categories'),
      ['cat-empty'],
    );
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('delete from fever_accounts'),
      ['1'],
    );
  });
});
