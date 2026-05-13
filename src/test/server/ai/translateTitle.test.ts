import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TRANSLATION_PROMPT } from '../../../server/ai/promptTemplates';

const createOpenAIClientMock = vi.hoisted(() => vi.fn());
const createCompletionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../server/ai/openaiClient', () => ({
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

describe('translateTitle', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('passes source metadata into createOpenAIClient', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '你好世界' } }],
    });

    const { translateTitle } = await import('../../../server/ai/translateTitle');
    const out = await translateTitle({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      title: 'Hello world',
      prompt: '请保持科技术语英文原样。',
    });

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(out).toBe('你好世界');
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/translateTitle',
        requestLabel: 'AI title translation request',
      }),
    );
    expect(systemPrompt).toContain('保持科技术语英文原样');
    expect(systemPrompt).toContain('仅输出翻译后的标题文本');
    expect(systemPrompt).not.toContain(DEFAULT_TRANSLATION_PROMPT);
  });

  it('falls back to default translation prompt when custom prompt is blank', async () => {
    createCompletionMock.mockResolvedValue({
      choices: [{ message: { content: '你好世界' } }],
    });

    const { translateTitle } = await import('../../../server/ai/translateTitle');
    await translateTitle({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'sk-test',
      model: 'gpt-4o-mini',
      title: 'Hello world',
      prompt: ' ',
    });

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;
    expect(systemPrompt).toContain(DEFAULT_TRANSLATION_PROMPT);
  });
});
