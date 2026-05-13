import { createOpenAIClient } from './openaiClient';
import { resolveSummaryPrompt } from './promptTemplates';

interface SummarizeTextInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  prompt?: string;
}

function getSummaryContent(content: unknown): string {
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Invalid summarize response: missing content');
  }
  return content.trim();
}

export async function summarizeText(input: SummarizeTextInput): Promise<string> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/summarizeText',
    requestLabel: 'AI summary request',
  });

  const completion = await client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    messages: [
      {
        role: 'system',
        content: resolveSummaryPrompt(input.prompt),
      },
      {
        role: 'user',
        content: input.text,
      },
    ],
  });

  return getSummaryContent(completion.choices?.[0]?.message?.content);
}
