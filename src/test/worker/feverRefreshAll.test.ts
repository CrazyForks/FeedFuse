import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('enqueueFeverRefreshAllTargets', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('records sync attempts for fever account targets before enqueueing tracked sync jobs', async () => {
    const boss = {
      send: vi.fn().mockResolvedValue('job-1'),
    };
    const markFeverAccountSyncAttempted = vi.fn().mockResolvedValue(undefined);

    const { enqueueFeverRefreshAllTargets } = await import('@/worker/feverRefreshAll');
    await enqueueFeverRefreshAllTargets({
      boss: boss as never,
      pool: 'pool' as never,
      runId: 'run-1',
      now: new Date('2026-05-24T14:30:00.000Z'),
      feverTargets: [
        {
          accountId: 'account-1',
          feedIds: ['feed-10', 'feed-11'],
        },
      ],
      markFeverAccountSyncAttempted,
    });

    expect(markFeverAccountSyncAttempted).toHaveBeenCalledWith('pool', {
      accountId: 'account-1',
      attemptedAt: '2026-05-24T14:30:00.000Z',
    });
    expect(boss.send).toHaveBeenCalledWith(
      'fever.sync',
      { accountId: 'account-1', runId: 'run-1', feedIds: ['feed-10', 'feed-11'] },
      expect.any(Object),
    );
  });
});
