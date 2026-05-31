import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('articlesRepo (media attachments)', () => {
  it('inserts article media attachments in stable order', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    await mod.insertArticleMediaAttachments(pool, 'article-1', [
      {
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: 123,
        durationSeconds: 456,
      },
      {
        url: 'https://pod.example.com/1.mp4',
        mimeType: 'video/mp4',
        sizeBytes: null,
        durationSeconds: null,
      },
    ]);

    const sql = String(query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('insert into article_media_attachments');
    expect(sql).toContain('on conflict (article_id, url) do nothing');
    expect(query.mock.calls[0]?.[1]).toEqual([
      '1',
      'article-1',
      'https://pod.example.com/1.mp3',
      'audio/mpeg',
      123,
      456,
      0,
      '1',
      'article-1',
      'https://pod.example.com/1.mp4',
      'video/mp4',
      null,
      null,
      1,
    ]);
  });

  it('lists media attachments by article id', async () => {
    const query = vi.fn().mockResolvedValue({
      rows: [
        {
          id: 'att-1',
          articleId: 'article-1',
          url: 'https://pod.example.com/1.mp3',
          mimeType: 'audio/mpeg',
          sizeBytes: '123',
          durationSeconds: 456,
        },
      ],
    });
    const pool = { query } as unknown as Pool;
    const mod = await import('@/server/domains/articles/repositories/articlesRepo');

    const rows = await mod.listArticleMediaAttachments(pool, 'article-1');

    expect(rows).toEqual([
      {
        id: 'att-1',
        articleId: 'article-1',
        url: 'https://pod.example.com/1.mp3',
        mimeType: 'audio/mpeg',
        sizeBytes: '123',
        durationSeconds: 456,
      },
    ]);
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('order by position asc, id asc');
    expect(query.mock.calls[0]?.[1]).toEqual(['article-1', '1']);
  });
});
