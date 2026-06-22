import { createOpenAIClient } from '@/server/integrations/ai/openaiClient';
import {
} from '@/server/integrations/ai/deepThinking';
import { buildTranslationSystemPrompt } from '@/server/integrations/ai/promptTemplates';
import {
  applyProviderThinkingConfig,
  extractAssistantText,
} from '@/server/integrations/ai/providerCompatibility';

export interface TranslateTitleInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  title: string;
  prompt?: string;
  deepThinkingEnabled?: boolean;
}

function getTranslationContent(message: unknown): string {
  const content = extractAssistantText(message as {
    content?: unknown;
    reasoning_content?: unknown;
  } | null | undefined);
  if (!content) {
    throw new Error('Invalid translate-title response: missing content');
  }
  return content;
}

export async function translateTitle(input: TranslateTitleInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/translateTitle',
    requestLabel: 'AI title translation request',
  });
  const completion = await client.chat.completions.create(applyProviderThinkingConfig({
    apiBaseUrl: input.apiBaseUrl,
    model: input.model,
    deepThinkingEnabled: Boolean(input.deepThinkingEnabled),
    request: {
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
    },
  }));

  return getTranslationContent(completion.choices?.[0]?.message);
}
