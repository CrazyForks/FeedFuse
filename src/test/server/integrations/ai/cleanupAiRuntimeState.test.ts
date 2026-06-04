import type { Pool } from 'pg';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanupAiRuntimeState } from '@/server/integrations/ai/cleanupAiRuntimeState';
import { AI_CONFIG_CHANGED_ERROR_CODE } from '@/server/integrations/ai/configFingerprints';

describe('cleanupAiRuntimeState', () => {
  const query = vi.fn();
  const pool = { query } as unknown as Pool;

  beforeEach(() => {
    query.mockReset();
  });

  it('scopes summary cleanup to the current user and writes event user_id', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'summary-1', draftText: 'draft', userId: '2' }],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await cleanupAiRuntimeState({
      pool,
      userId: '2',
      scopes: {
        summary: true,
        translation: false,
        digest: false,
      },
    });

    expect(result).toEqual({
      summarySessions: 1,
      translationSessions: 0,
      digestRuns: 0,
      taskRows: 1,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('where user_id = $1'),
      ['2'],
    );
    expect(query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('where user_id = $4'),
      [
        AI_CONFIG_CHANGED_ERROR_CODE,
        expect.any(String),
        expect.any(String),
        '2',
      ],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('insert into article_ai_summary_events'),
      [
        'summary-1',
        '2',
        'session.failed',
        expect.objectContaining({
          sessionId: 'summary-1',
          errorCode: AI_CONFIG_CHANGED_ERROR_CODE,
        }),
      ],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('and user_id = $2'),
      [
        'ai_summary',
        '2',
        AI_CONFIG_CHANGED_ERROR_CODE,
        expect.any(String),
        expect.any(String),
      ],
    );
  });

  it('scopes translation cleanup to the current user and writes event user_id', async () => {
    query
      .mockResolvedValueOnce({
        rows: [{ id: 'translation-1', userId: '3' }],
      })
      .mockResolvedValueOnce({ rowCount: 2 })
      .mockResolvedValueOnce({
        rows: [{ totalSegments: 2, translatedSegments: 0, failedSegments: 2 }],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await cleanupAiRuntimeState({
      pool,
      userId: '3',
      scopes: {
        summary: false,
        translation: true,
        digest: false,
      },
    });

    expect(result).toEqual({
      summarySessions: 0,
      translationSessions: 1,
      digestRuns: 0,
      taskRows: 1,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('where user_id = $1'),
      ['3'],
    );
    expect(query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('where id = $1'),
      ['translation-1', 2, 0, 2, expect.any(String), '3'],
    );
    expect(query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('insert into article_translation_events'),
      [
        'translation-1',
        '3',
        'session.failed',
        expect.objectContaining({
          errorCode: AI_CONFIG_CHANGED_ERROR_CODE,
        }),
      ],
    );
    expect(query).toHaveBeenNthCalledWith(
      6,
      expect.stringContaining('and user_id = $2'),
      [
        'ai_translate',
        '3',
        AI_CONFIG_CHANGED_ERROR_CODE,
        expect.any(String),
        expect.any(String),
      ],
    );
  });

  it('scopes digest cleanup to the current user', async () => {
    query.mockResolvedValueOnce({ rowCount: 2 });

    const result = await cleanupAiRuntimeState({
      pool,
      userId: '5',
      scopes: {
        summary: false,
        translation: false,
        digest: true,
      },
    });

    expect(result).toEqual({
      summarySessions: 0,
      translationSessions: 0,
      digestRuns: 2,
      taskRows: 0,
    });
    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('where user_id = $3'),
      [AI_CONFIG_CHANGED_ERROR_CODE, expect.any(String), '5'],
    );
  });
});
