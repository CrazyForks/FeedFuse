export interface AiRuntimeConfig {
  model: string;
  apiBaseUrl: string;
  apiKey: string;
  deepThinkingEnabled: boolean;
}

export interface SharedAiConfigInput {
  settings: {
    ai: {
      model: string;
      apiBaseUrl: string;
      deepThinkingEnabled?: boolean;
    };
  };
  aiApiKey: string;
}

function trim(value: string): string {
  return value.trim();
}

export function resolveSharedAiConfig(input: SharedAiConfigInput): AiRuntimeConfig {
  return {
    model: trim(input.settings.ai.model),
    apiBaseUrl: trim(input.settings.ai.apiBaseUrl),
    apiKey: trim(input.aiApiKey),
    deepThinkingEnabled: Boolean(input.settings.ai.deepThinkingEnabled),
  };
}

export function isAiRuntimeConfigComplete(config: AiRuntimeConfig): boolean {
  return Boolean(config.model && config.apiBaseUrl && config.apiKey);
}
