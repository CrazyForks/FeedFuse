import { describe, expect, it, vi } from 'vitest';

describe('articleTranslationRepo', () => {
  it('upsertSession stores running session with hash and counters', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const mod = await import('@/server/domains/articles/repositories/articleTranslationRepo');
    await mod.upsertTranslationSession(pool as never, {
      articleId: 'a1',
      sourceHtmlHash: 'hash-1',
      status: 'running',
      totalSegments: 3,
      translatedSegments: 0,
      failedSegments: 0,
      rawErrorMessage: null,
    });
    expect(pool.query).toHaveBeenCalled();
    const sql = String(pool.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('on conflict (user_id, article_id) do update');
    expect(sql).not.toContain('user_id = excluded.user_id');
  });

  it('upsertSegment stores raw_error_message for failed segments', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
    const mod = await import('@/server/domains/articles/repositories/articleTranslationRepo');

    await mod.upsertTranslationSegment(pool as never, {
      sessionId: 'session-1',
      segmentIndex: 1,
      sourceText: 'A',
      translatedText: null,
      status: 'failed',
      errorCode: 'ai_rate_limited',
      errorMessage: '请求太频繁了，请稍后重试',
      rawErrorMessage: '429 rate limit',
    });

    const sql = String(pool.query.mock.calls[0]?.[0] ?? '');
    expect(sql).toContain('raw_error_message');
    expect(sql).toContain('on conflict (user_id, session_id, segment_index) do update');
    expect(sql).not.toContain('user_id = excluded.user_id');
    expect(pool.query.mock.calls[0]?.[1]).toEqual([
      '1',
      'session-1',
      1,
      'A',
      null,
      'failed',
      'ai_rate_limited',
      '请求太频繁了，请稍后重试',
      '429 rate limit',
    ]);
  });
});
