import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FeverAccountSettingsPanel from '../../../features/settings/panels/FeverAccountSettingsPanel';

describe('FeverAccountSettingsPanel', () => {
  beforeEach(() => {
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
});
