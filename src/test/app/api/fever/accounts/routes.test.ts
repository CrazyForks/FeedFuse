import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const listFeverAccountsMock = vi.fn();
const createFeverAccountMock = vi.fn();
const deleteFeverAccountMock = vi.fn();
const updateFeverAccountMock = vi.fn();
const markFeverAccountSyncAttemptedMock = vi.fn();
const enqueueWithResultMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  listFeverAccounts: (...args: unknown[]) => listFeverAccountsMock(...args),
  createFeverAccount: (...args: unknown[]) => createFeverAccountMock(...args),
  deleteFeverAccount: (...args: unknown[]) => deleteFeverAccountMock(...args),
  updateFeverAccount: (...args: unknown[]) => updateFeverAccountMock(...args),
  markFeverAccountSyncAttempted: (...args: unknown[]) => markFeverAccountSyncAttemptedMock(...args),
}));

vi.mock('@/server/infra/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

describe('/api/fever/accounts', () => {
  beforeEach(() => {
    listFeverAccountsMock.mockReset();
    createFeverAccountMock.mockReset();
    deleteFeverAccountMock.mockReset();
    updateFeverAccountMock.mockReset();
    markFeverAccountSyncAttemptedMock.mockReset();
    enqueueWithResultMock.mockReset();
  });

  it('POST creates fever account and returns connection status', async () => {
    createFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
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
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
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
    expect(markFeverAccountSyncAttemptedMock).toHaveBeenCalledWith(
      pool,
      expect.objectContaining({ accountId: '1' }),
    );
  });

  it('POST /sync returns already_enqueued when fever sync is duplicated', async () => {
    enqueueWithResultMock.mockResolvedValue({ status: 'throttled_or_duplicate' });

    const mod = await import('../../../../../app/api/fever/accounts/[id]/sync/route.ts');
    const response = await mod.POST(
      new Request('http://localhost/api/fever/accounts/1/sync', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data).toEqual({ queued: false, reason: 'already_enqueued' });
  });

  it('PATCH updates fever account settings', async () => {
    updateFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://updated.example.com',
      username: 'updated-demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 45,
      lastSyncAt: null,
      lastError: null,
    });

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.PATCH(
      new Request('http://localhost/api/fever/accounts', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: '1',
          baseUrl: 'https://updated.example.com',
          username: 'updated-demo',
          apiKey: 'updated-secret',
          autoSyncEnabled: false,
          autoSyncIntervalMinutes: 45,
        }),
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(updateFeverAccountMock).toHaveBeenCalledWith(pool, {
      accountId: '1',
      baseUrl: 'https://updated.example.com',
      username: 'updated-demo',
      apiKey: 'updated-secret',
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 45,
    });
    expect(json.data.apiKey).toBeUndefined();
    expect(json.data.baseUrl).toBe('https://updated.example.com');
    expect(json.data.username).toBe('updated-demo');
    expect(json.data.autoSyncEnabled).toBe(false);
    expect(json.data.autoSyncIntervalMinutes).toBe(45);
  });

  it('DELETE removes a fever account', async () => {
    deleteFeverAccountMock.mockResolvedValue(true);

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.DELETE(
      new Request('http://localhost/api/fever/accounts?id=1', {
        method: 'DELETE',
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(deleteFeverAccountMock).toHaveBeenCalledWith(pool, '1');
  });

  it('DELETE validates account id presence', async () => {
    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.DELETE(
      new Request('http://localhost/api/fever/accounts', {
        method: 'DELETE',
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('validation_error');
    expect(json.error.fields.id).toBeTruthy();
  });
});
