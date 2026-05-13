import { describe, expect, it, vi } from 'vitest';

vi.mock('@/server/infra/env', () => ({
  getServerEnv: () => ({
    DATABASE_URL: 'postgres://example',
  }),
}));

describe('db pool', () => {
  it('returns a singleton pool', async () => {
    const mod = await import('@/server/infra/db/pool');
    expect(mod.getPool()).toBe(mod.getPool());
  });
});
