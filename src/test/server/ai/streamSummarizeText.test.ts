import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SUMMARY_PROMPT } from '@/server/integrations/ai/promptTemplates';

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

function fakeOpenAiStream(chunks: string[]) {
  return (async function* () {
    for (const chunk of chunks) {
      yield {
        choices: [
          {
            delta: {
              content: chunk,
            },
          },
        ],
      };
    }
  })();
}

function fakeMixedStream(
  chunks: Array<{ content?: string; reasoning_content?: string }>,
) {
  return (async function* () {
    for (const chunk of chunks) {
      yield {
        choices: [
          {
            delta: chunk,
          },
        ],
      };
    }
  })();
}

describe('streamSummarizeText', () => {
  beforeEach(() => {
    createOpenAIClientMock.mockReset();
    createCompletionMock.mockReset();
  });

  it('yields summary text chunks from chat completion stream', async () => {
    const chunks = ['TL;DR', '\n- 第一条', '\n- 第二条'];
    const result: string[] = [];
    const mod = await import('@/server/integrations/ai/streamSummarizeText');

    for await (const part of mod.streamSummarizeText(
      {
        apiBaseUrl: 'https://api.openai.com/v1',
        apiKey: 'key',
        model: 'gpt-4o-mini',
        text: 'hello',
      },
      {
        createStream: async () => fakeOpenAiStream(chunks),
      },
    )) {
      result.push(part);
    }

    expect(result).toEqual(chunks);
  });

  it('uses custom summary prompt when provided', async () => {
    createCompletionMock.mockResolvedValue(fakeOpenAiStream(['一句话总结', '\n- 第一条']));
    const result: string[] = [];
    const mod = await import('@/server/integrations/ai/streamSummarizeText');

    for await (const part of mod.streamSummarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      text: 'hello',
      prompt: '请用儿童也能理解的中文总结，并输出 2 条要点。',
    })) {
      result.push(part);
    }

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(result).toEqual(['一句话总结', '\n- 第一条']);
    expect(createOpenAIClientMock).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'server/ai/streamSummarizeText',
        requestLabel: 'AI summary request',
      }),
    );
    expect(systemPrompt).toContain('儿童也能理解');
    expect(systemPrompt).not.toContain(DEFAULT_SUMMARY_PROMPT);
  });

  it('falls back to default summary prompt when prompt is blank', async () => {
    createCompletionMock.mockResolvedValue(fakeOpenAiStream(['一句话总结', '\n- 第一条']));
    const mod = await import('@/server/integrations/ai/streamSummarizeText');

    for await (const part of mod.streamSummarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      text: 'hello',
      prompt: '   ',
    })) {
      // 仅消费流，触发默认 prompt 分支执行
      void part;
    }

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(systemPrompt).toBe(DEFAULT_SUMMARY_PROMPT);
    expect(systemPrompt).toContain('不要返回');
    expect(systemPrompt).toContain('TL;DR');
  });

  it('adds deep thinking request hints but still requires final-only output', async () => {
    createCompletionMock.mockResolvedValue(fakeOpenAiStream(['结论']));
    const mod = await import('@/server/integrations/ai/streamSummarizeText');

    for await (const part of mod.streamSummarizeText({
      apiBaseUrl: 'https://api.openai.com/v1',
      apiKey: 'key',
      model: 'gpt-4o-mini',
      text: 'hello',
      deepThinkingEnabled: true,
    })) {
      void part;
    }

    const request = createCompletionMock.mock.calls[0]?.[0];
    const systemPrompt = request?.messages?.[0]?.content;

    expect(request?.reasoning_effort).toBe('high');
    expect(systemPrompt).toContain('只输出最终结果');
    expect(systemPrompt).toContain('<think>');
  });

  it('uses DeepSeek thinking payload and ignores reasoning-only stream deltas', async () => {
    createCompletionMock.mockResolvedValue(
      fakeMixedStream([
        { reasoning_content: '先分析' },
        { content: '最终' },
        { content: '答案' },
      ]),
    );
    const result: string[] = [];
    const mod = await import('@/server/integrations/ai/streamSummarizeText');

    for await (const part of mod.streamSummarizeText({
      apiBaseUrl: 'https://api.deepseek.com',
      apiKey: 'key',
      model: 'deepseek-v4-pro',
      text: 'hello',
      deepThinkingEnabled: true,
    })) {
      result.push(part);
    }

    const request = createCompletionMock.mock.calls[0]?.[0];
    expect(result).toEqual(['最终', '答案']);
    expect(request?.reasoning_effort).toBe('high');
    expect(request?.thinking).toEqual({ type: 'enabled' });
    expect(request?.temperature).toBeUndefined();
  });
});
