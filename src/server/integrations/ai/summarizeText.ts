import { createOpenAIClient } from '@/server/integrations/ai/openaiClient';
import {
  buildFinalOnlySystemPrompt,
} from '@/server/integrations/ai/deepThinking';
import { resolveSummaryPrompt } from '@/server/integrations/ai/promptTemplates';
import {
  applyProviderThinkingConfig,
  extractAssistantText,
} from '@/server/integrations/ai/providerCompatibility';

export interface SummarizeTextInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  prompt?: string;
  deepThinkingEnabled?: boolean;
}

function getSummaryContent(message: unknown): string {
  const content = extractAssistantText(message as {
    content?: unknown;
    reasoning_content?: unknown;
  } | null | undefined);
  if (!content) {
    throw new Error('Invalid summarize response: missing content');
  }
  return content;
}

export async function summarizeText(input: SummarizeTextInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/summarizeText',
    requestLabel: 'AI summary request',
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
          content: buildFinalOnlySystemPrompt(
            resolveSummaryPrompt(input.prompt),
            Boolean(input.deepThinkingEnabled),
          ),
        },
        {
          role: 'user',
          content: input.text,
        },
      ],
    },
  }));

  return getSummaryContent(completion.choices?.[0]?.message);
}
