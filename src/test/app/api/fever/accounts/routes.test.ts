import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const listFeverAccountsMock = vi.fn();
const createFeverAccountMock = vi.fn();
const deleteFeverAccountMock = vi.fn();
const deleteFeverAccountAndSourcesMock = vi.fn();
const updateFeverAccountMock = vi.fn();
const markFeverAccountSyncAttemptedMock = vi.fn();
const getFeverAccountByIdMock = vi.fn();
const enqueueWithResultMock = vi.fn();
const createFeverClientMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/fever/repositories/feverAccountsRepo', () => ({
  listFeverAccounts: (...args: unknown[]) => listFeverAccountsMock(...args),
  createFeverAccount: (...args: unknown[]) => createFeverAccountMock(...args),
  deleteFeverAccount: (...args: unknown[]) => deleteFeverAccountMock(...args),
  updateFeverAccount: (...args: unknown[]) => updateFeverAccountMock(...args),
  markFeverAccountSyncAttempted: (...args: unknown[]) => markFeverAccountSyncAttemptedMock(...args),
  getFeverAccountById: (...args: unknown[]) => getFeverAccountByIdMock(...args),
}));

vi.mock('@/server/domains/fever/services/feverAccountLifecycleService', () => ({
  deleteFeverAccountAndSources: (...args: unknown[]) => deleteFeverAccountAndSourcesMock(...args),
}));

vi.mock('@/server/infra/queue/queue', () => ({
  enqueueWithResult: (...args: unknown[]) => enqueueWithResultMock(...args),
}));

vi.mock('@/server/integrations/fever/feverClient', () => ({
  createFeverClient: (...args: unknown[]) => createFeverClientMock(...args),
}));

describe('/api/fever/accounts', () => {
  beforeEach(() => {
    listFeverAccountsMock.mockReset();
    createFeverAccountMock.mockReset();
    deleteFeverAccountMock.mockReset();
    deleteFeverAccountAndSourcesMock.mockReset();
    updateFeverAccountMock.mockReset();
    markFeverAccountSyncAttemptedMock.mockReset();
    getFeverAccountByIdMock.mockReset();
    enqueueWithResultMock.mockReset();
    createFeverClientMock.mockReset();
  });

  it('POST creates fever account and returns connection status', async () => {
    createFeverClientMock.mockReturnValue({
      listFeeds: vi.fn().mockResolvedValue([]),
    });
    createFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: false,
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 0,
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
          enabled: false,
          autoSyncIntervalMinutes: 0,
        }),
      }),
    );

    const json = await response.json();
    expect(json.ok).toBe(true);
    expect(json.data.apiKey).toBeUndefined();
    expect(createFeverAccountMock).toHaveBeenCalledWith(pool, {
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: false,
      autoSyncIntervalMinutes: 0,
    });
  });

  it('POST validates fever account connection before saving', async () => {
    createFeverClientMock.mockReturnValue({
      listFeeds: vi.fn().mockRejectedValue(new Error('Fever 认证失败')),
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

    expect(json.ok).toBe(false);
    expect(createFeverAccountMock).not.toHaveBeenCalled();
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
    getFeverAccountByIdMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
      createdAt: '2026-05-24T00:00:00.000Z',
    });
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

  it('POST /sync rejects missing fever account before enqueue', async () => {
    getFeverAccountByIdMock.mockResolvedValue(null);

    const mod = await import('../../../../../app/api/fever/accounts/[id]/sync/route.ts');
    const response = await mod.POST(
      new Request('http://localhost/api/fever/accounts/1/sync', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await response.json();

    expect(json.ok).toBe(false);
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
  });

  it('POST /sync returns already_enqueued when fever sync is duplicated', async () => {
    getFeverAccountByIdMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
      createdAt: '2026-05-24T00:00:00.000Z',
    });
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

  it('POST /sync rejects disabled fever account before enqueue', async () => {
    getFeverAccountByIdMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: false,
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 0,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
      createdAt: '2026-05-24T00:00:00.000Z',
    });

    const mod = await import('../../../../../app/api/fever/accounts/[id]/sync/route.ts');
    const response = await mod.POST(
      new Request('http://localhost/api/fever/accounts/1/sync', {
        method: 'POST',
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const json = await response.json();

    expect(json.ok).toBe(false);
    expect(enqueueWithResultMock).not.toHaveBeenCalled();
    expect(markFeverAccountSyncAttemptedMock).not.toHaveBeenCalled();
  });

  it('PATCH updates fever account settings', async () => {
    getFeverAccountByIdMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
      createdAt: '2026-05-24T00:00:00.000Z',
    });
    createFeverClientMock.mockReturnValue({
      listFeeds: vi.fn().mockResolvedValue([]),
    });
    updateFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://updated.example.com',
      username: 'updated-demo',
      apiKey: 'secret',
      enabled: false,
      autoSyncEnabled: false,
      autoSyncIntervalMinutes: 0,
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
          enabled: false,
          autoSyncIntervalMinutes: 0,
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
      enabled: false,
      autoSyncIntervalMinutes: 0,
    });
    expect(json.data.apiKey).toBeUndefined();
    expect(json.data.baseUrl).toBe('https://updated.example.com');
    expect(json.data.username).toBe('updated-demo');
    expect(json.data.enabled).toBe(false);
    expect(json.data.autoSyncEnabled).toBe(false);
    expect(json.data.autoSyncIntervalMinutes).toBe(0);
  });

  it('PATCH revalidates connection when baseUrl changes without a new api key', async () => {
    const listFeedsMock = vi.fn().mockResolvedValue([]);
    getFeverAccountByIdMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
      lastError: null,
      createdAt: '2026-05-24T00:00:00.000Z',
    });
    createFeverClientMock.mockReturnValue({
      listFeeds: listFeedsMock,
    });
    updateFeverAccountMock.mockResolvedValue({
      id: '1',
      baseUrl: 'https://updated.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      lastSyncAt: null,
      lastSyncAttemptAt: null,
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
          username: 'demo',
          apiKey: '',
          enabled: true,
          autoSyncIntervalMinutes: 30,
        }),
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(createFeverClientMock).toHaveBeenCalledWith({
      baseUrl: 'https://updated.example.com',
      username: 'demo',
      apiKey: 'secret',
    });
    expect(listFeedsMock).toHaveBeenCalledTimes(1);
  });

  it('DELETE removes a fever account and its local fever sources', async () => {
    deleteFeverAccountAndSourcesMock.mockResolvedValue(true);

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.DELETE(
      new Request('http://localhost/api/fever/accounts?id=1', {
        method: 'DELETE',
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(deleteFeverAccountAndSourcesMock).toHaveBeenCalledWith(pool, '1');
    expect(json.data.deleted).toBe(true);
  });

  it('DELETE returns deleted=false when fever account is missing', async () => {
    deleteFeverAccountAndSourcesMock.mockResolvedValue(false);

    const mod = await import('../../../../../app/api/fever/accounts/route');
    const response = await mod.DELETE(
      new Request('http://localhost/api/fever/accounts?id=404', {
        method: 'DELETE',
      }),
    );
    const json = await response.json();

    expect(json.ok).toBe(true);
    expect(json.data.deleted).toBe(false);
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
