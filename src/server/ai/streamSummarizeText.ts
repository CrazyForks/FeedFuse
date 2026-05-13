import { createOpenAIClient } from './openaiClient';
import { resolveSummaryPrompt } from './promptTemplates';

export interface StreamSummarizeTextInput {
  apiBaseUrl: string;
  apiKey: string;
  model: string;
  text: string;
  prompt?: string;
}

interface StreamChunkShape {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
}

interface StreamSummarizeTextDeps {
  createStream?: (
    input: StreamSummarizeTextInput,
  ) => Promise<AsyncIterable<StreamChunkShape>> | AsyncIterable<StreamChunkShape>;
}

async function createDefaultStream(
  input: StreamSummarizeTextInput,
): Promise<AsyncIterable<StreamChunkShape>> {
  const client = createOpenAIClient({
    apiBaseUrl: input.apiBaseUrl,
    apiKey: input.apiKey,
    source: 'server/ai/streamSummarizeText',
    requestLabel: 'AI summary request',
  });
  return client.chat.completions.create({
    model: input.model,
    temperature: 0.2,
    stream: true,
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
}

export async function* streamSummarizeText(
  input: StreamSummarizeTextInput,
  deps?: StreamSummarizeTextDeps,
): AsyncGenerator<string> {
  const createStream = deps?.createStream ?? createDefaultStream;
  const stream = await createStream(input);

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      yield delta;
    }
  }
}
