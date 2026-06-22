import { createOpenAIClient } from '@/server/integrations/ai/openaiClient';
import {
  applyDeepThinkingToChatRequest,
  buildFinalOnlySystemPrompt,
  stripThinkingText,
} from '@/server/integrations/ai/deepThinking';
import { resolveSummaryPrompt } from '@/server/integrations/ai/promptTemplates';

interface SummarizeTextInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  prompt?: string;
  deepThinkingEnabled?: boolean;
}

function getSummaryContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid summarize response: missing content');
  }
  return stripThinkingText(content);
}

export async function summarizeText(input: SummarizeTextInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/summarizeText',
    requestLabel: 'AI summary request',
  });

  const completion = await client.chat.completions.create(applyDeepThinkingToChatRequest({
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
  }, Boolean(input.deepThinkingEnabled)));

  return getSummaryContent(completion.choices?.[0]?.message?.content);
}
