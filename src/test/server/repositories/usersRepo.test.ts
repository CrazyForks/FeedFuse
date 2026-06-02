import type { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';
import {
  changeUserPassword,
  createUser,
  ensureUserSettings,
  findUserByUsername,
  listUsers,
  persistInitialAdminPassword,
  resetUserPassword,
  setUserStatus,
  updateUser,
} from '@/server/domains/auth/repositories/usersRepo';

describe('usersRepo', () => {
  it('finds users by normalized username', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{
        id: '1',
        username: 'admin',
        passwordHash: 'scrypt$hash',
        role: 'admin',
        status: 'active',
        sessionVersion: 2,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-02',
      }],
    });

    const pool = { query } as unknown as Pool;
    const user = await findUserByUsername(pool, ' Admin ');

    expect(user?.username).toBe('admin');
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('where lower(username) = lower($1)'),
      ['Admin'],
    );
  });

  it('creates users and ensures user settings in a transaction', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce({
        rows: [{
          id: '2',
          username: 'member',
          passwordHash: 'scrypt$hash',
          role: 'member',
          status: 'active',
          sessionVersion: 1,
          createdAt: '2026-01-01',
          updatedAt: '2026-01-01',
        }],
      })
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const pool = { query } as unknown as Pool;
    const user = await createUser(pool, {
      username: 'member',
      passwordHash: 'scrypt$hash',
      role: 'member',
    });

    expect(user.id).toBe('2');
    expect(query).toHaveBeenNthCalledWith(1, 'begin');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into users');
    expect(String(query.mock.calls[2]?.[0] ?? '')).toContain('insert into user_settings');
    expect(query).toHaveBeenLastCalledWith('commit');
  });

  it('lists users without exposing password_hash', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: '1', username: 'admin', role: 'admin', status: 'active', sessionVersion: 1 }],
    });

    const pool = { query } as unknown as Pool;
    const users = await listUsers(pool);

    expect(users[0]).not.toHaveProperty('passwordHash');
    expect(String(query.mock.calls[0]?.[0] ?? '')).not.toContain('password_hash as');
  });

  it('updates status and rotates session version on password changes', async () => {
    const query = vi
      .fn()
      .mockResolvedValueOnce({ rows: [{ id: '2', username: 'member', role: 'member', status: 'disabled', sessionVersion: 2 }] })
      .mockResolvedValueOnce({ rows: [{ id: '2', username: 'member', role: 'member', status: 'active', sessionVersion: 3 }] })
      .mockResolvedValueOnce({ rows: [{ id: '2', username: 'member', role: 'member', status: 'active', sessionVersion: 4 }] });

    const pool = { query } as unknown as Pool;
    await setUserStatus(pool, { userId: '2', status: 'disabled' });
    await resetUserPassword(pool, { userId: '2', passwordHash: 'scrypt$new' });
    await changeUserPassword(pool, { userId: '2', passwordHash: 'scrypt$self' });

    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('status = $2');
    expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('session_version = session_version + 1');
    expect(String(query.mock.calls[2]?.[0] ?? '')).toContain('password_hash = $2');
  });

  it('updates username role status and password in one statement', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: '2', username: 'member-next', role: 'admin', status: 'disabled', sessionVersion: 4 }],
    });

    const pool = { query } as unknown as Pool;
    await updateUser(pool, {
      userId: '2',
      username: ' member-next ',
      role: 'admin',
      status: 'disabled',
      passwordHash: 'scrypt$next',
    });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('username = $2');
    expect(sql).toContain('role = $3');
    expect(sql).toContain('status = $4');
    expect(sql).toContain('password_hash = $5');
    expect(sql).toContain('session_version = session_version + 1');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '2',
      'member-next',
      'admin',
      'disabled',
      'scrypt$next',
    ]);
  });

  it('persists initial admin password only when hash is empty', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [{ id: '1', username: 'admin', passwordHash: 'scrypt$next', role: 'admin', status: 'active', sessionVersion: 2 }],
    });

    const pool = { query } as unknown as Pool;
    await persistInitialAdminPassword(pool, { userId: '1', passwordHash: 'scrypt$next' });

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain("where id = $1 and password_hash = ''");
    expect(sql).toContain('session_version = session_version + 1');
  });

  it('ensures user settings row exists', async () => {
    const query = vi.fn().mockResolvedValue(undefined);
    const pool = { query } as unknown as Pool;

    await ensureUserSettings(pool, '2');

    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('insert into user_settings');
    expect(query.mock.calls[0]?.[1]).toEqual(['2']);
  });
});
