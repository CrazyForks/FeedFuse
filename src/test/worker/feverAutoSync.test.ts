import { beforeEach, describe, expect, it, vi } from 'vitest';

const listEnabledFeverAccountsForAutoSyncMock = vi.hoisted(() => vi.fn());
const markFeverAccountSyncAttemptedMock = vi.hoisted(() => vi.fn());
const enqueueWithResultMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  listEnabledFeverAccountsForAutoSync: (...args: unknown[]) =>
    listEnabledFeverAccountsForAutoSyncMock(...args),
  markFeverAccountSyncAttempted: (...args: unknown[]) => markFeverAccountSyncAttemptedMock(...args),
}));

vi.mock('@/server/infra/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

describe('feverAutoSync worker', () => {
  beforeEach(() => {
    listEnabledFeverAccountsForAutoSyncMock.mockReset();
    markFeverAccountSyncAttemptedMock.mockReset();
    enqueueWithResultMock.mockReset();
  });

  it('selects due auto sync accounts by last attempt time', async () => {
    const { selectFeverAccountsForAutoSync } = await import('@/worker/feverAutoSync');
    const now = new Date('2026-05-23T10:00:00.000Z');

    const due = selectFeverAccountsForAutoSync(
      [
        {
          id: 'due-1',
          baseUrl: 'https://reader.example.com',
          username: 'demo',
          apiKey: 'secret',
          enabled: true,
          autoSyncEnabled: true,
          autoSyncIntervalMinutes: 30,
          createdAt: '2026-05-23T08:00:00.000Z',
          lastSyncAt: '2026-05-23T09:00:00.000Z',
          lastSyncAttemptAt: null,
          lastError: null,
        },
        {
          id: 'skip-1',
          baseUrl: 'https://reader.example.com',
          username: 'demo',
          apiKey: 'secret',
          enabled: true,
          autoSyncEnabled: true,
          autoSyncIntervalMinutes: 30,
          createdAt: '2026-05-23T08:00:00.000Z',
          lastSyncAt: '2026-05-23T09:45:00.000Z',
          lastSyncAttemptAt: null,
          lastError: null,
        },
      ],
      now,
    );

    expect(due.map((account) => account.id)).toEqual(['due-1']);
  });

  it('enqueues only due accounts and records attempt time', async () => {
    listEnabledFeverAccountsForAutoSyncMock.mockResolvedValue([
      {
        id: 'due-1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        apiKey: 'secret',
        enabled: true,
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
        createdAt: '2026-05-23T08:00:00.000Z',
        lastSyncAt: '2026-05-23T09:00:00.000Z',
        lastSyncAttemptAt: null,
        lastError: null,
      },
      {
        id: 'skip-1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        apiKey: 'secret',
        enabled: true,
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
        createdAt: '2026-05-23T08:00:00.000Z',
        lastSyncAt: '2026-05-23T09:50:00.000Z',
        lastSyncAttemptAt: null,
        lastError: null,
      },
    ]);
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-1' });

    const { runFeverAutoSyncWorker } = await import('@/worker/feverAutoSync');
    const now = new Date('2026-05-23T10:00:00.000Z');
    const pool = {} as never;

    const result = await runFeverAutoSyncWorker({ pool, now });

    expect(result).toEqual({ enqueued: 1 });
    expect(enqueueWithResultMock).toHaveBeenCalledTimes(1);
    expect(markFeverAccountSyncAttemptedMock).toHaveBeenCalledWith(pool, {
      accountId: 'due-1',
      attemptedAt: now.toISOString(),
    });
  });

  it('skips disabled accounts even when they are due', async () => {
    listEnabledFeverAccountsForAutoSyncMock.mockResolvedValue([
      {
        id: 'disabled-1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        apiKey: 'secret',
        enabled: false,
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
        createdAt: '2026-05-23T08:00:00.000Z',
        lastSyncAt: '2026-05-23T09:00:00.000Z',
        lastSyncAttemptAt: null,
        lastError: null,
      },
    ]);

    const { runFeverAutoSyncWorker } = await import('@/worker/feverAutoSync');
    const result = await runFeverAutoSyncWorker({
      pool: {} as never,
      now: new Date('2026-05-23T10:00:00.000Z'),
    });

    expect(result).toEqual({ enqueued: 0 });
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
    expect(markFeverAccountSyncAttemptedMock).not.toHaveBeenCalled();
  });
});
