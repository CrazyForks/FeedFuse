import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('node:dns/promises', () => {
  const lookup = vi.fn();
  return {
    lookup,
    default: { lookup },
  };
});

import { lookup } from 'node:dns/promises';
import { isSafeMediaUrl } from '@/server/integrations/media/mediaProxyGuard';

describe('mediaProxyGuard', () => {
  const lookupMock = vi.mocked(lookup);

  beforeEach(() => {
    lookupMock.mockReset();
    vi.unstubAllEnvs();
  });

  it('rejects localhost and loopback targets', async () => {
    await expect(isSafeMediaUrl('http://localhost/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('http://127.0.0.1/image.jpg')).resolves.toBe(false);
  });

  it('rejects domains resolving to private addresses', async () => {
    lookupMock.mockResolvedValue([{ address: '10.0.0.5', family: 4 }]);

    await expect(isSafeMediaUrl('https://internal.example/image.jpg')).resolves.toBe(false);
  });

  it('accepts public https urls without credentials', async () => {
    lookupMock.mockResolvedValue([{ address: '93.184.216.34', family: 4 }]);

    await expect(isSafeMediaUrl('https://public.example/image.jpg')).resolves.toBe(true);
  });

  it('accepts fake-ip media targets when network compatibility is enabled', async () => {
    vi.stubEnv('RSS_NETWORK_MODE', 'fake-ip');
    lookupMock.mockResolvedValue([{ address: '198.18.0.46', family: 4 }]);

    await expect(isSafeMediaUrl('https://img.3dmgame.com/image.jpg')).resolves.toBe(true);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/video.mp4')).resolves.toBe(true);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/audio.mp3')).resolves.toBe(true);
  });

  it('keeps rejecting fake-ip media targets by default', async () => {
    lookupMock.mockResolvedValue([{ address: '198.18.0.46', family: 4 }]);

    await expect(isSafeMediaUrl('https://img.3dmgame.com/image.jpg')).resolves.toBe(false);
    await expect(isSafeMediaUrl('https://cdn.3dmgame.com/video.mp4')).resolves.toBe(false);
  });

  it('rejects credentialed urls', async () => {
    await expect(isSafeMediaUrl('https://user:pass@example.com/image.jpg')).resolves.toBe(false);
  });
});
