import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifyUserPasswordMock = vi.fn();
const createSessionCookieHeaderMock = vi.fn();

vi.mock('@/server/domains/auth/services/session', () => ({
  verifyUserPassword: (...args: unknown[]) =>
    verifyUserPasswordMock(...args),
  createSessionCookieHeader: (...args: unknown[]) => createSessionCookieHeaderMock(...args),
}));

describe('/api/auth/login', () => {
  beforeEach(() => {
    verifyUserPasswordMock.mockReset();
    createSessionCookieHeaderMock.mockReset().mockResolvedValue(
      'feedfuse_session=signed-token; Path=/; HttpOnly; SameSite=Lax; Max-Age=3600',
    );
  });

  it('returns authenticated true and sets session cookie on success', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: true,
      user: { userId: '1', role: 'admin', sessionVersion: 2 },
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(json.ok).toBe(true);
    expect(json.data.authenticated).toBe(true);
    expect(json.data.user).toEqual({ id: '1', type: 'initial_admin', role: 'admin' });
    expect(verifyUserPasswordMock).toHaveBeenCalledWith({
      username: 'admin',
      password: 'initial-password',
    });
    expect(createSessionCookieHeaderMock).toHaveBeenCalledWith({
      userId: '1',
      role: 'admin',
      sessionVersion: 2,
    });
    expect(res.headers.get('set-cookie')).toContain('feedfuse_session=signed-token');
  });

  it('returns 503 when initial password is missing', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: false,
      reason: 'missing_initial_password',
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'initial-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(503);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('service_unavailable');
  });

  it('returns 401 when password is invalid', async () => {
    verifyUserPasswordMock.mockResolvedValue({
      ok: false,
      reason: 'invalid_password',
    });

    const mod = await import('../../../../../app/api/auth/login/route');
    const res = await mod.POST(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username: 'admin', password: 'wrong-password' }),
      }),
    );
    const json = await res.json();

    expect(res.status).toBe(401);
    expect(json.ok).toBe(false);
    expect(json.error.code).toBe('unauthorized');
  });
});
