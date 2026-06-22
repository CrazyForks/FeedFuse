import { describe, expect, it } from 'vitest';
import {
  applyProviderThinkingConfig,
  extractAssistantText,
  extractStreamTextDelta,
} from '@/server/integrations/ai/providerCompatibility';

describe('providerCompatibility', () => {
  it('adds DeepSeek thinking payload and strips unsupported sampling knobs', () => {
    const request = applyProviderThinkingConfig({
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      deepThinkingEnabled: true,
      request: {
        model: 'deepseek-v4-pro',
        temperature: 0.2,
        top_p: 0.9,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.reasoning_effort).toBe('high');
    expect((request as Record<string, unknown>).thinking).toEqual({ type: 'enabled' });
    expect(request.temperature).toBeUndefined();
    expect(request.top_p).toBeUndefined();
  });

  it('keeps OpenAI requests on reasoning_effort only', () => {
    const request = applyProviderThinkingConfig({
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      deepThinkingEnabled: true,
      request: {
        model: 'gpt-5.5',
        temperature: 0.2,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.reasoning_effort).toBe('high');
    expect((request as Record<string, unknown>).thinking).toBeUndefined();
    expect(request.temperature).toBe(0.2);
  });

  it('does not treat non-DeepSeek hosts as DeepSeek just because the model name matches', () => {
    const request = applyProviderThinkingConfig({
      apiBaseUrl: 'https://openrouter.ai/api/v1',
      model: 'deepseek-v4-pro',
      deepThinkingEnabled: true,
      request: {
        model: 'deepseek-v4-pro',
        temperature: 0.2,
        top_p: 0.9,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    // 只有原生 DeepSeek host 才需要私有 thinking 参数。
    expect(request.reasoning_effort).toBe('high');
    expect((request as Record<string, unknown>).thinking).toBeUndefined();
    expect(request.temperature).toBe(0.2);
    expect(request.top_p).toBe(0.9);
  });

  it('prefers content but falls back to reasoning_content when content is blank', () => {
    expect(
      extractAssistantText({ content: '最终答案', reasoning_content: '思考过程' }),
    ).toBe('最终答案');
    expect(
      extractAssistantText({
        content: '   ',
        reasoning_content: '<think>分析</think>最终答案',
      }),
    ).toBe('最终答案');
  });

  it('reads streaming content and ignores reasoning-only deltas', () => {
    expect(
      extractStreamTextDelta({
        choices: [{ delta: { reasoning_content: '先分析' } }],
      }),
    ).toBe('');
    expect(
      extractStreamTextDelta({
        choices: [{ delta: { content: '最终答案' } }],
      }),
    ).toBe('最终答案');
  });
});
