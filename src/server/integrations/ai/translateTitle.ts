import { createOpenAIClient } from '@/server/integrations/ai/openaiClient';
import {
  applyDeepThinkingToChatRequest,
  stripThinkingText,
} from '@/server/integrations/ai/deepThinking';
import { buildTranslationSystemPrompt } from '@/server/integrations/ai/promptTemplates';

interface TranslateTitleInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  title: string;
  prompt?: string;
  deepThinkingEnabled?: boolean;
}

function getTranslationContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid translate-title response: missing content');
  }
  return stripThinkingText(content);
}

export async function translateTitle(input: TranslateTitleInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/translateTitle',
    requestLabel: 'AI title translation request',
  });
  const completion = await client.chat.completions.create(applyDeepThinkingToChatRequest({
    model: input.model,
    temperature: 0.1,
    messages: [
      {
        role: 'system',
        content: buildTranslationSystemPrompt({
          basePrompt: input.prompt,
          taskInstruction: '请将用户给出的文章标题翻译成简体中文（zh-CN），仅输出翻译后的标题文本，不要输出解释。',
          deepThinkingEnabled: input.deepThinkingEnabled,
        }),
      },
      {
        role: 'user',
        content: input.title,
      },
    ],
  }, Boolean(input.deepThinkingEnabled)));

  return getTranslationContent(completion.choices?.[0]?.message?.content);
}
