import { beforeEach, describe, expect, it, vi } from 'vitest';

const pool = {};
const requireApiSessionMock = vi.fn();
const listUsersMock = vi.fn();
const createUserMock = vi.fn();
const getUserByIdMock = vi.fn();
const setUserStatusMock = vi.fn();
const resetUserPasswordMock = vi.fn();
const changeUserPasswordMock = vi.fn();
const hashPasswordMock = vi.fn();
const verifyPasswordMock = vi.fn();

vi.mock('@/server/infra/db/pool', () => ({
  getPool: () => pool,
}));

vi.mock('@/server/domains/auth/services/session', () => ({
  requireApiSession: (...args: unknown[]) => requireApiSessionMock(...args),
}));

vi.mock('@/server/domains/auth/services/password', () => ({
  hashPassword: (...args: unknown[]) => hashPasswordMock(...args),
  verifyPassword: (...args: unknown[]) => verifyPasswordMock(...args),
}));

vi.mock('@/server/domains/auth/repositories/usersRepo', () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  createUser: (...args: unknown[]) => createUserMock(...args),
  getUserById: (...args: unknown[]) => getUserByIdMock(...args),
  setUserStatus: (...args: unknown[]) => setUserStatusMock(...args),
  resetUserPassword: (...args: unknown[]) => resetUserPasswordMock(...args),
  changeUserPassword: (...args: unknown[]) => changeUserPasswordMock(...args),
}));

describe('/api/users', () => {
  beforeEach(() => {
    requireApiSessionMock.mockReset().mockResolvedValue({
      userId: '1',
      role: 'admin',
      sessionVersion: 1,
    });
    listUsersMock.mockReset();
    createUserMock.mockReset();
    getUserByIdMock.mockReset();
    setUserStatusMock.mockReset();
    resetUserPasswordMock.mockReset();
    changeUserPasswordMock.mockReset();
    hashPasswordMock.mockReset().mockReturnValue('scrypt$hashed');
    verifyPasswordMock.mockReset().mockReturnValue(true);
  });

  it('GET lists users for admins', async () => {
    listUsersMock.mockResolvedValue([
      { id: '1', username: 'admin', role: 'admin', status: 'active', sessionVersion: 1 },
    ]);

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.GET();
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data[0].username).toBe('admin');
    expect(listUsersMock).toHaveBeenCalledWith(pool);
  });

  it('GET rejects members', async () => {
    requireApiSessionMock.mockResolvedValue({ userId: '2', role: 'member', sessionVersion: 1 });

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.GET();
    const json = await res.json();

    expect(res.status).toBe(403);
    expect(json.error.code).toBe('forbidden');
  });

  it('POST creates users for admins', async () => {
    createUserMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
    });

    const mod = await import('../../../../app/api/users/route');
    const res = await mod.POST(
      new Request('http://localhost/api/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'member', password: 'password-123', role: 'member' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(hashPasswordMock).toHaveBeenCalledWith('password-123');
    expect(createUserMock).toHaveBeenCalledWith(pool, {
      username: 'member',
      passwordHash: 'scrypt$hashed',
      role: 'member',
    });
  });

  it('PATCH updates status and resets password', async () => {
    setUserStatusMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'disabled',
      sessionVersion: 2,
    });
    resetUserPasswordMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'disabled',
      sessionVersion: 3,
    });

    const mod = await import('../../../../app/api/users/[id]/route');
    const res = await mod.PATCH(
      new Request('http://localhost/api/users/2', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ status: 'disabled', password: 'next-password-123' }),
      }),
      { params: Promise.resolve({ id: '2' }) },
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(setUserStatusMock).toHaveBeenCalledWith(pool, { userId: '2', status: 'disabled' });
    expect(resetUserPasswordMock).toHaveBeenCalledWith(pool, {
      userId: '2',
      passwordHash: 'scrypt$hashed',
    });
  });

  it('POST /api/users/me/password changes current user password', async () => {
    getUserByIdMock.mockResolvedValue({
      id: '2',
      username: 'member',
      passwordHash: 'scrypt$old',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
    });
    changeUserPasswordMock.mockResolvedValue({
      id: '2',
      username: 'member',
      role: 'member',
      status: 'active',
      sessionVersion: 2,
    });

    const mod = await import('../../../../app/api/users/me/password/route');
    const res = await mod.POST(
      new Request('http://localhost/api/users/me/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword: 'old-password-123', nextPassword: 'new-password-123' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(changeUserPasswordMock).toHaveBeenCalledWith(pool, {
      userId: '1',
      passwordHash: 'scrypt$hashed',
    });
  });
});
