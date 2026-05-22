import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const listFeverAccountsMock = vi.fn();
const createFeverAccountMock = vi.fn();
const enqueueWithResultMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  listFeverAccounts: (...args: unknown[]) => listFeverAccountsMock(...args),
  createFeverAccount: (...args: unknown[]) => createFeverAccountMock(...args),
}));

vi.mock('@/server/infra/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

describe('/api/fever/accounts', () => {
  beforeEach(() => {
    listFeverAccountsMock.mockReset();
    createFeverAccountMock.mockReset();
    enqueueWithResultMock.mockReset();
  });

  it('POST creates fever account and returns connection status', async () => {
    createFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      lastSyncAt: null,
      lastError: null,
    });

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.POST(
      new Request('http://localhost/api/fever/accounts', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          baseUrl: 'https://reader.example.com',
          username: 'demo',
          apiKey: 'secret',
        }),
      }),
    );

    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data.apiKey).toBeUndefined();
  });

  it('GET lists fever accounts without api key', async () => {
    listFeverAccountsMock.mockResolvedValue([
      {
        id: '1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        apiKey: 'secret',
        enabled: true,
        lastSyncAt: null,
        lastError: null,
      },
    ]);

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.GET();
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data[0].apiKey).toBeUndefined();
  });

  it('POST /sync enqueues fever sync job', async () => {
    enqueueWithResultMock.mockResolvedValue({ status: 'enqueued', jobId: 'job-1' });

    const mod = await import('../../../../../app/api/fever/accounts/[id]/sync/route.ts');
    const response = await mod.POST(
      new Request('http://localhost/api/fever/accounts/1/sync', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data.queued).toBe(true);
  });
});
