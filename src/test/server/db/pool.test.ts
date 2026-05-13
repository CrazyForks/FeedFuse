import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/env', () => ({
  getServerEnv: () => ({
    DATABASE_URL: 'postgres://example',
  }),
}));

describe('db pool', () => {
  it('returns a singleton pool', async () => {
    const mod = await import('../../../server/db/pool');
    expect(mod.getPool()).toBe(mod.getPool());
  });
});
