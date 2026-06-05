import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('settingsRepo (user settings and keys)', () => {
  it('reads and updates ai_api_key in user_settings', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ aiApiKey: 'sk-test' }] })
      .mockResolvedValueOnce({ rows: [{ aiApiKey: 'sk-next' }] })
      .mockResolvedValueOnce({ rows: [{ aiApiKey: '' }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/settings/repositories/settingsRepo')) as typeof import('@/server/domains/settings/repositories/settingsRepo');

    if (typeof mod.getAiApiKey !== 'function') {
      expect.fail('getAiApiKey is not implemented');
    }
    if (typeof mod.setAiApiKey !== 'function') {
      expect.fail('setAiApiKey is not implemented');
    }
    if (typeof mod.clearAiApiKey !== 'function') {
      expect.fail('clearAiApiKey is not implemented');
    }

    const first = await mod.getAiApiKey(pool, '1');
    expect(first).toBe('sk-test');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('ai_api_key');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('from user_settings');
    expect(query.mock.calls[0]?.[1]).toEqual(['1']);

    const second = await mod.setAiApiKey(pool, '1', 'sk-next');
    expect(second).toBe('sk-next');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into user_settings');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('on conflict (user_id)');
    expect(query.mock.calls[1]?.[1]).toEqual(['1', 'sk-next']);

    const third = await mod.clearAiApiKey(pool, '1');
    expect(third).toBe('');
    expect(String(query.mock.calls[2]?.[0] ?? '')).toContain('insert into user_settings');
    expect(query.mock.calls[2]?.[1]).toEqual(['1', '']);
  });

  it('reads and updates ui_settings by user_id', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ uiSettings: { theme: 'dark' } }] })
      .mockResolvedValueOnce({ rows: [{ uiSettings: { theme: 'light' } }] });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/settings/repositories/settingsRepo')) as typeof import('@/server/domains/settings/repositories/settingsRepo');

    await expect(mod.getUiSettings(pool, '1')).resolves.toEqual({ theme: 'dark' });
    await expect(mod.updateUiSettings(pool, '1', { theme: 'light' })).resolves.toEqual({ theme: 'light' });

    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('from user_settings');
    expect(query.mock.calls[0]?.[1]).toEqual(['1']);
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into user_settings');
    expect(query.mock.calls[1]?.[1]).toEqual(['1', { theme: 'light' }]);
  });
});

describe('settingsRepo (auth settings)', () => {
  it('reads auth settings and rotates session secret on password update', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({
        rows: [{ authPasswordHash: 'scrypt$old', authSessionSecret: 'secret-old' }],
      })
      .mockResolvedValueOnce({
        rows: [{ authPasswordHash: 'scrypt$new', authSessionSecret: 'secret-new' }],
      });

    const pool = { query } as unknown as Pool;
    const mod = (await import('@/server/domains/settings/repositories/settingsRepo')) as typeof import('@/server/domains/settings/repositories/settingsRepo');

    if (typeof mod.getAuthSettings !== 'function') {
      expect.fail('getAuthSettings is not implemented');
    }
    if (typeof mod.updateAuthPassword !== 'function') {
      expect.fail('updateAuthPassword is not implemented');
    }

    const current = await mod.getAuthSettings(pool);
    expect(current).toEqual({
      authPasswordHash: 'scrypt$old',
      authSessionSecret: 'secret-old',
    });
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('auth_password_hash');

    const updated = await mod.updateAuthPassword(pool, 'scrypt$new');
    expect(updated).toEqual({
      authPasswordHash: 'scrypt$new',
      authSessionSecret: 'secret-new',
    });
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('auth_session_secret');
    expect(query.mock.calls[1]?.[1]).toEqual(['scrypt$new']);
  });
});
