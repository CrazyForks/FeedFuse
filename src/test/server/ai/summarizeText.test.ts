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

describe('summarizeText', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '一句话总结\n- 第一条' } }],
    });

    const { summarizeText } = await import('@/server/integrations/ai/summarizeText');
    const out = await summarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      text: 'hello',
    });

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(out).toBe('一句话总结\n- 第一条');
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/summarizeText',
        requestLabel: 'AI summary request',
      }),
    );
    expect(systemPrompt).toContain('不要返回');
    expect(systemPrompt).toContain('TL;DR');
  });

  it('falls back to reasoning_content for DeepSeek-compatible responses', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '', reasoning_content: '<think>分析</think>最终答案' } }],
    });

    const { summarizeText } = await import('@/server/integrations/ai/summarizeText');
    const out = await summarizeText({
      apiBaseUrl: 'https://api.deepseek.com',
      apiKey: 'sk-test',
      model: 'deepseek-v4-pro',
      text: 'hello',
      deepThinkingEnabled: true,
    });

    const request = createCompletionMock.mock.calls[0]?.[0];
    expect(out).toBe('最终答案');
    expect(request?.thinking).toEqual({ type: 'enabled' });
    expect(request?.temperature).toBeUndefined();
  });
});
