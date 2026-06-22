import { createOpenAIClient } from '@/server/integrations/ai/openaiClient';
import {
} from '@/server/integrations/ai/deepThinking';
import { buildTranslationSystemPrompt } from '@/server/integrations/ai/promptTemplates';
import {
  applyProviderThinkingConfig,
  extractAssistantText,
} from '@/server/integrations/ai/providerCompatibility';

export interface TranslateHtmlInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  html: string;
  prompt?: string;
  deepThinkingEnabled?: boolean;
}

function getTranslationContent(message: unknown): string {
  const content = extractAssistantText(message as {
    content?: unknown;
    reasoning_content?: unknown;
  } | null | undefined);
  if (!content) {
    throw new Error('Invalid translate response: missing content');
  }
  return content;
}

export async function translateHtml(input: TranslateHtmlInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/translateHtml',
    requestLabel: 'AI translation request',
  });
  const completion = await client.chat.completions.create(applyProviderThinkingConfig({
    apiBaseUrl: input.apiBaseUrl,
    model: input.model,
    deepThinkingEnabled: Boolean(input.deepThinkingEnabled),
    request: {
      model: input.model,
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: buildTranslationSystemPrompt({
            basePrompt: input.prompt,
            taskInstruction:
              '请将用户提供的 HTML 内容翻译为简体中文（zh-CN）。只翻译可见文本，保持原始 HTML 结构不变（标签/层级/列表等），严禁改动任何属性值（尤其 href/src/srcset）与 URL。只输出 HTML 字符串，不要输出解释文字或代码块标记。',
            deepThinkingEnabled: input.deepThinkingEnabled,
          }),
        },
        {
          role: 'user',
          content: input.html,
        },
      ],
    },
  }));

  return getTranslationContent(completion.choices?.[0]?.message);
}
