import { beforeEach, describe, expect, it, vi } from 'vitest';

const createClientForAccountMock = vi.hoisted(() => vi.fn());
const syncFeverAccountMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/fever/services/feverWritebackService', () => ({
  createClientForAccount: (...args: unknown[]) => createClientForAccountMock(...args),
}));

vi.mock('@/server/domains/fever/services/feverSyncService', () => ({
  syncFeverAccount: (...args: unknown[]) => syncFeverAccountMock(...args),
}));

describe('feverSync worker', () => {
  beforeEach(() => {
    createClientForAccountMock.mockReset();
    syncFeverAccountMock.mockReset();
  });

  it('runs fever sync worker with account id', async () => {
    const pool = {} as never;
    const client = { listFeeds: vi.fn(), listItems: vi.fn(), markItem: vi.fn() };
    createClientForAccountMock.mockResolvedValue(client);

    const { runFeverSyncWorker } = await import('@/worker/feverSync');
    await runFeverSyncWorker({
      pool,
      data: { accountId: '1' },
    });

    expect(createClientForAccountMock).toHaveBeenCalledWith(pool, '1');
    expect(syncFeverAccountMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({
        accountId: '1',
        client,
      }),
    );
  });
});
