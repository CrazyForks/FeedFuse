import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const { runImmediateSuccessMock, runImmediateFailureMock } = vi.hoisted(() => ({
  runImmediateSuccessMock: vi.fn(),
  runImmediateFailureMock: vi.fn(),
}));

vi.mock('../../../features/notifications/userOperationNotifier', () => ({
  runImmediateSuccess: (...args: unknown[]) => runImmediateSuccessMock(...args),
  runImmediateFailure: (...args: unknown[]) => runImmediateFailureMock(...args),
}));

import FeverAccountSettingsPanel from '../../../features/settings/panels/FeverAccountSettingsPanel';

type FeverAccountFixture = {
  id: string;
  baseUrl: string;
  username: string;
  enabled: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

async function readJsonBody(input: RequestInfo | URL, init?: RequestInit): Promise<Record<string, unknown>> {
  if (typeof Request !== 'undefined' && input instanceof Request) {
    return input.json().catch(() => ({}));
  }

  if (!init?.body) {
    return {};
  }

  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

describe('FeverAccountSettingsPanel', () => {
  beforeEach(() => {
    runImmediateSuccessMock.mockReset();
    runImmediateFailureMock.mockReset();
    let accounts: FeverAccountFixture[] = [];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({ ok: true, data: accounts }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts') && method === 'POST') {
          const created = {
            id: '1',
            baseUrl: 'https://reader.example.com',
            username: 'demo',
            enabled: true,
            autoSyncEnabled: true,
            autoSyncIntervalMinutes: 30,
            lastSyncAt: null,
            lastError: null,
          };
          accounts = [created];

          return new Response(JSON.stringify({
            ok: true,
            data: created,
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts') && method === 'PATCH') {
          const body = await readJsonBody(input, init);
          accounts = accounts.map((account) => (
            account.id === body.id
              ? {
                  ...account,
                  baseUrl: String(body.baseUrl ?? account.baseUrl),
                  username: String(body.username ?? account.username),
                  autoSyncEnabled: body.autoSyncEnabled,
                  autoSyncIntervalMinutes: body.autoSyncIntervalMinutes,
                }
              : account
          ));
          const updated = accounts.find((account) => account.id === body.id) ?? null;

          return new Response(JSON.stringify({ ok: true, data: updated }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts/1/sync') && method === 'POST') {
          return new Response(JSON.stringify({ ok: true, data: { queued: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );
  });

  it('loads existing fever accounts on mount', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({
            ok: true,
            data: [
              {
                id: 'persisted-1',
                baseUrl: 'https://reader.example.com',
                username: 'persisted-user',
                enabled: true,
                autoSyncEnabled: true,
                autoSyncIntervalMinutes: 30,
                lastSyncAt: null,
                lastError: null,
              },
            ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('persisted-user')).toBeInTheDocument();
      expect(screen.getByText('https://reader.example.com')).toBeInTheDocument();
    });
  });

  it('opens create modal and creates fever account card', async () => {
    render(<FeverAccountSettingsPanel />);

    fireEvent.click(screen.getByRole('button', { name: '添加 Fever 账号' }));

    expect(screen.getByRole('dialog', { name: '添加 Fever 账号' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://reader.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存账号' }));

    await waitFor(() => {
      expect(screen.getByText('demo')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: '立即同步' })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: '添加 Fever 账号' })).not.toBeInTheDocument();
    });
  });

  it('shows syncing state and emits success when sync is queued', async () => {
    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          listCalls += 1;
          return new Response(JSON.stringify({
            ok: true,
            data: listCalls >= 2
              ? [
                  {
                    id: '1',
                    baseUrl: 'https://reader.example.com',
                    username: 'demo',
                    enabled: true,
                    autoSyncEnabled: true,
                    autoSyncIntervalMinutes: 30,
                    lastSyncAt: '2026-05-23T00:23:37.240Z',
                    lastError: null,
                  },
                ]
              : [
                  {
                    id: '1',
                    baseUrl: 'https://reader.example.com',
                    username: 'demo',
                    enabled: true,
                    autoSyncEnabled: true,
                    autoSyncIntervalMinutes: 30,
                    lastSyncAt: null,
                    lastError: null,
                  },
                ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts/1/sync') && method === 'POST') {
          return new Response(JSON.stringify({ ok: true, data: { queued: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    const syncButton = await screen.findByRole('button', { name: '立即同步' });
    fireEvent.click(syncButton);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '同步中…' })).toBeDisabled();
    });

    await waitFor(() => {
      expect(runImmediateSuccessMock).toHaveBeenCalledWith({ actionKey: 'fever.sync' });
      expect(screen.getByRole('button', { name: '立即同步' })).toBeEnabled();
    });
    expect(runImmediateFailureMock).not.toHaveBeenCalled();
  });

  it('shows account lastError inline after reload', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({
            ok: true,
            data: [
              {
                id: '1',
                baseUrl: 'https://reader.example.com',
                username: 'demo',
                enabled: true,
                autoSyncEnabled: true,
                autoSyncIntervalMinutes: 30,
                lastSyncAt: null,
                lastError: 'Fever 认证失败',
              },
            ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    await waitFor(() => {
      expect(screen.getByText('Fever 认证失败')).toBeInTheDocument();
    });
  });

  it('deletes fever account after confirmation and removes it from the list', async () => {
    let accounts: FeverAccountFixture[] = [
      {
        id: '1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        enabled: true,
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
        lastSyncAt: null,
        lastError: null,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({ ok: true, data: accounts }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts?id=1') && method === 'DELETE') {
          accounts = [];
          return new Response(JSON.stringify({ ok: true, data: { deleted: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    await screen.findByText('demo');
    fireEvent.click(screen.getByRole('button', { name: '删除账号' }));
    fireEvent.click(await screen.findByRole('button', { name: '确认删除' }));

    await waitFor(() => {
      expect(screen.queryByText('demo')).not.toBeInTheDocument();
    });
  });

  it('refreshes account status after sync completes and shows lastSyncAt', async () => {
    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          listCalls += 1;
          const data = listCalls >= 2
            ? [
                {
                  id: '1',
                  baseUrl: 'https://reader.example.com',
                  username: 'demo',
                  enabled: true,
                  autoSyncEnabled: true,
                  autoSyncIntervalMinutes: 30,
                  lastSyncAt: '2026-05-23T00:23:37.240Z',
                  lastError: null,
                },
              ]
            : [
                {
                  id: '1',
                  baseUrl: 'https://reader.example.com',
                  username: 'demo',
                  enabled: true,
                  autoSyncEnabled: true,
                  autoSyncIntervalMinutes: 30,
                  lastSyncAt: '2026-05-23T00:20:00.000Z',
                  lastError: null,
                },
              ];

          return new Response(JSON.stringify({ ok: true, data }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts/1/sync') && method === 'POST') {
          return new Response(JSON.stringify({ ok: true, data: { queued: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '立即同步' }));

    await waitFor(() => {
      expect(screen.getByText('2026/05/23 08:23:37')).toBeInTheDocument();
    });
  });

  it('refreshes account status after sync and shows backend lastError', async () => {
    let listCalls = 0;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          listCalls += 1;
          const data = listCalls >= 2
            ? [
                {
                  id: '1',
                  baseUrl: 'https://reader.example.com',
                  username: 'demo',
                  enabled: true,
                  autoSyncEnabled: true,
                  autoSyncIntervalMinutes: 30,
                  lastSyncAt: null,
                  lastError: 'Fever 认证失败',
                },
              ]
            : [
                {
                  id: '1',
                  baseUrl: 'https://reader.example.com',
                  username: 'demo',
                  enabled: true,
                  autoSyncEnabled: true,
                  autoSyncIntervalMinutes: 30,
                  lastSyncAt: '2026-05-23T00:20:00.000Z',
                  lastError: null,
                },
              ];

          return new Response(JSON.stringify({ ok: true, data }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts/1/sync') && method === 'POST') {
          return new Response(JSON.stringify({ ok: true, data: { queued: true } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    fireEvent.click(await screen.findByRole('button', { name: '立即同步' }));

    await waitFor(() => {
      expect(screen.getByText('Fever 认证失败')).toBeInTheDocument();
    });
  });

  it('opens edit modal, updates auto sync settings, and reflects saved values', async () => {
    let accounts: FeverAccountFixture[] = [
      {
        id: '1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        enabled: true,
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
        lastSyncAt: null,
        lastError: null,
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({ ok: true, data: accounts }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        if (url.includes('/api/fever/accounts') && method === 'PATCH') {
          const body = await readJsonBody(input, init);
          accounts = [
            {
              ...accounts[0],
              baseUrl: String(body.baseUrl ?? accounts[0].baseUrl),
              username: String(body.username ?? accounts[0].username),
              autoSyncEnabled: Boolean(body.autoSyncEnabled),
              autoSyncIntervalMinutes: Number(body.autoSyncIntervalMinutes ?? accounts[0].autoSyncIntervalMinutes),
            },
          ];
          return new Response(JSON.stringify({ ok: true, data: accounts[0] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    await screen.findByText('demo');
    fireEvent.click(screen.getByRole('button', { name: '编辑 demo' }));
    expect(screen.getByRole('dialog', { name: '编辑 Fever 账号' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://updated.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'updated-demo' },
    });
    fireEvent.change(screen.getByLabelText('API Key（留空表示不修改）'), {
      target: { value: 'updated-secret' },
    });
    expect(screen.getByDisplayValue('30')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('switch', { name: '启用 demo 自动同步' }));
    fireEvent.change(screen.getByLabelText('自动同步间隔（分钟）'), {
      target: { value: '45' },
    });
    fireEvent.click(screen.getByRole('button', { name: '保存账号设置' }));

    await waitFor(() => {
      expect(runImmediateSuccessMock).toHaveBeenCalledWith({
        actionKey: 'fever.sync',
        context: { outcome: 'settings_saved' },
      });
    });
    expect(screen.getByText('updated-demo')).toBeInTheDocument();
    expect(screen.getByText('https://updated.example.com')).toBeInTheDocument();
    expect(screen.getByText('已关闭')).toBeInTheDocument();
  });

  it('shows compact account cards without inline create form fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string'
            ? input
            : typeof URL !== 'undefined' && input instanceof URL
              ? input.toString()
              : typeof Request !== 'undefined' && input instanceof Request
                ? input.url
                : String(input);
        const method =
          typeof Request !== 'undefined' && input instanceof Request
            ? input.method
            : init?.method ?? 'GET';

        if (url.includes('/api/fever/accounts') && method === 'GET') {
          return new Response(JSON.stringify({
            ok: true,
            data: [
              {
                id: '1',
                baseUrl: 'https://reader.example.com',
                username: 'demo',
                enabled: true,
                autoSyncEnabled: true,
                autoSyncIntervalMinutes: 30,
                lastSyncAt: null,
                lastError: null,
              },
            ],
          }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          });
        }

        throw new Error(`Unexpected fetch: ${url}`);
      }),
    );

    render(<FeverAccountSettingsPanel />);

    await screen.findByText('demo');

    expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
    expect(screen.getByText('自动同步')).toBeInTheDocument();
    expect(screen.getByText('https://reader.example.com')).toBeInTheDocument();
    expect(screen.getByText('尚未同步')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '编辑 demo' })).toBeInTheDocument();
  });
});
