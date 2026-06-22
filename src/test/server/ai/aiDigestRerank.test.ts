import { beforeEach, describe, expect, it, vi } from 'vitest';

const createOpenAIClientMock = vi.hoisted(() => vi.fn());
const createCompletionMock = vi.hoisted(() => vi.fn());

vi.mock('@/server/integrations/ai/openaiClient', () => ({
  createOpenAIClient: (...args: unknown[]) => {
    createOpenAIClientMock(...args);
    return {
      chat: {
        completions: {
          create: createCompletionMock,
        },
      },
    };
  },
}));

describe('aiDigestRerank', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '```json\n["a1","a2"]\n```' } }],
    });

    const { aiDigestRerank } = await import('@/server/integrations/ai/aiDigestRerank');
    const out = await aiDigestRerank({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      prompt: '整理这些文章的智能报告',
      batch: [
        {
          id: 'a1',
          feedTitle: 'Feed 1',
          title: 'Title 1',
          summary: null,
          link: null,
          fetchedAt: '2026-03-14T00:00:00.000Z',
        },
        {
          id: 'a2',
          feedTitle: 'Feed 2',
          title: 'Title 2',
          summary: null,
          link: null,
          fetchedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    expect(out).toEqual(['a1', 'a2']);
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/aiDigestRerank',
        requestLabel: 'AI digest rerank request',
      }),
    );
  });

  it('supports DeepSeek thinking payload and reasoning_content fallback', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '', reasoning_content: '<think>分析</think>["a1"]' } }],
    });

    const { aiDigestRerank } = await import('@/server/integrations/ai/aiDigestRerank');
    const out = await aiDigestRerank({
      apiBaseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-v4-pro',
      prompt: '整理这些文章的智能报告',
      deepThinkingEnabled: true,
      batch: [
        {
          id: 'a1',
          feedTitle: 'Feed 1',
          title: 'Title 1',
          summary: null,
          link: null,
          fetchedAt: '2026-03-14T00:00:00.000Z',
        },
      ],
    });

    const request = createCompletionMock.mock.calls[0]?.[0];
    expect(out).toEqual(['a1']);
    expect(request?.thinking).toEqual({ type: 'enabled' });
    expect(request?.temperature).toBeUndefined();
  });
});
