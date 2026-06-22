import OpenAI from 'openai';
import { stripThinkingText } from '@/server/integrations/ai/deepThinking';

const DEEPSEEK_HOST_RE = /(^|\.)deepseek\.com$/i;

type ChatRequest = OpenAI.Chat.ChatCompletionCreateParams;
type StreamingChatRequest = OpenAI.Chat.ChatCompletionCreateParamsStreaming;
type NonStreamingChatRequest = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

interface StreamChunkLike {
  choices?: Array<{
    delta?: {
      content?: unknown;
      reasoning_content?: unknown;
    };
  }>;
}

interface AssistantMessageLike {
  content?: unknown;
  reasoning_content?: unknown;
}

function getProviderHostname(apiBaseUrl: string): string {
  try {
    return new URL(apiBaseUrl).hostname;
  } catch {
    return '';
  }
}

function isDeepSeekProvider(apiBaseUrl: string): boolean {
  const hostname = getProviderHostname(apiBaseUrl);
  // 只按 provider host 判断，避免把第三方 OpenAI-compatible 网关误判成原生 DeepSeek。
  return DEEPSEEK_HOST_RE.test(hostname);
}

export function applyProviderThinkingConfig<T extends StreamingChatRequest>(input: {
  apiBaseUrl: string;
  model: string;
  deepThinkingEnabled: boolean;
  request: T;
}): T;
export function applyProviderThinkingConfig<T extends NonStreamingChatRequest>(input: {
  apiBaseUrl: string;
  model: string;
  deepThinkingEnabled: boolean;
  request: T;
}): T;
export function applyProviderThinkingConfig<T extends ChatRequest>(input: {
  apiBaseUrl: string;
  model: string;
  deepThinkingEnabled: boolean;
  request: T;
}): T {
  const request = { ...input.request } as T;
  if (!input.deepThinkingEnabled) {
    return request;
  }

  request.reasoning_effort = 'high';

  if (!isDeepSeekProvider(input.apiBaseUrl)) {
    return request;
  }

  // DeepSeek 需要显式声明 thinking，并避免继续传递会被忽略的采样参数。
  const nextRequest = request as T & Record<string, unknown>;
  nextRequest.thinking = { type: 'enabled' };
  delete nextRequest.temperature;
  delete nextRequest.top_p;
  delete nextRequest.presence_penalty;
  delete nextRequest.frequency_penalty;
  return nextRequest;
}

function readOptionalText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

export function extractAssistantText(message: AssistantMessageLike | null | undefined): string {
  if (!message || typeof message !== 'object') {
    return '';
  }

  const content = readOptionalText((message as AssistantMessageLike).content).trim();
  if (content) {
    return stripThinkingText(content);
  }

  const reasoningContent = readOptionalText(
    (message as AssistantMessageLike).reasoning_content,
  ).trim();
  return stripThinkingText(reasoningContent);
}

export function extractStreamTextDelta(chunk: StreamChunkLike): string {
  const delta = chunk.choices?.[0]?.delta;
  return typeof delta?.content === 'string' ? delta.content : '';
}
