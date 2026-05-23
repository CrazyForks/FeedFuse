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

describe('FeverAccountSettingsPanel', () => {
  beforeEach(() => {
    runImmediateSuccessMock.mockReset();
    runImmediateFailureMock.mockReset();
    let accounts: Array<{
      id: string;
      baseUrl: string;
      username: string;
      enabled: boolean;
      lastSyncAt: string | null;
      lastError: string | null;
    }> = [];

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

  it('creates fever account and exposes sync action', async () => {
    render(<FeverAccountSettingsPanel />);

    fireEvent.change(screen.getByLabelText('Base URL'), {
      target: { value: 'https://reader.example.com' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'demo' },
    });
    fireEvent.change(screen.getByLabelText('API Key'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: '添加 Fever 账号' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '立即同步' })).toBeInTheDocument();
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
    let accounts = [
      {
        id: '1',
        baseUrl: 'https://reader.example.com',
        username: 'demo',
        enabled: true,
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
      expect(screen.getByText('上次同步：2026/05/23 08:23:37')).toBeInTheDocument();
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
});
