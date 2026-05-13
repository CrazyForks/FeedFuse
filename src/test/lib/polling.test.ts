import { describe, expect, it } from 'vitest';

describe('polling', () => {
  it('exports pollWithBackoff', async () => {
    const mod = await import('../../lib/polling');
    expect(mod.pollWithBackoff).toBeTypeOf('function');
  });
});

