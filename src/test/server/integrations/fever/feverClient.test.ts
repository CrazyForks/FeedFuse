import { describe, expect, it, vi } from 'vitest';

describe('feverClient', () => {
  it('posts api payload with fever auth and parses feeds response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        feeds: [{ id: '1', title: 'Feed', url: 'https://example.com/feed' }],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    const result = await client.listFeeds();

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://reader.example.com/?api&feeds=1',
      expect.objectContaining({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: expect.any(URLSearchParams),
      }),
    );
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('api_key')).toBe('3610fcbefb84d63611e69521ee5d95fb');
    expect(body.get('feeds')).toBeNull();
    expect(result[0]?.id).toBe('1');
  });

  it('passes since_id when listing items', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
        items: [{ id: '11', feed_id: '1', title: 'Item', created_on_time: 1779444300 }],
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com/',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    const items = await client.listItems('88');

    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://reader.example.com/?api&items=1&since_id=88');
    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('items')).toBeNull();
    expect(body.get('since_id')).toBeNull();
    expect(items[0]?.feedId).toBe('1');
    expect(items[0]?.createdAt).toBe('2026-05-22T10:05:00.000Z');
  });

  it('builds mark item payload', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        api_version: 3,
        auth: 1,
      }),
    });

    const { createFeverClient } = await import('@/server/integrations/fever/feverClient');
    const client = createFeverClient({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      fetchImpl,
    });

    await client.markItem({ itemId: '42', as: 'saved' });

    const body = fetchImpl.mock.calls[0]?.[1]?.body as URLSearchParams;
    expect(body.get('mark')).toBe('item');
    expect(body.get('id')).toBe('42');
    expect(body.get('as')).toBe('saved');
  });
});
