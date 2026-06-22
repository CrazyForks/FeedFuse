import { describe, expect, it } from 'vitest';
import { resolveAiCleanupScopesForInputs } from '@/server/integrations/ai/configFingerprints';

describe('resolveAiCleanupScopesForInputs', () => {
  it('treats deepThinkingEnabled as a dedicated translation config change', () => {
    const scopes = resolveAiCleanupScopesForInputs({
      previous: {
        settings: {
          ai: {
            model: 'gpt-4o-mini',
            apiBaseUrl: 'https://shared.example.com/v1',
            deepThinkingEnabled: false,
            summaryPrompt: '',
            translationPrompt: '',
            translation: {
              useSharedAi: false,
              model: 'deepseek-v4-pro',
              apiBaseUrl: 'https://translation.example.com/v1',
            },
          },
        },
        aiApiKey: 'shared-key',
        translationApiKey: 'translation-key',
      },
      next: {
        settings: {
          ai: {
            model: 'gpt-4o-mini',
            apiBaseUrl: 'https://shared.example.com/v1',
            deepThinkingEnabled: true,
            summaryPrompt: '',
            translationPrompt: '',
            translation: {
              useSharedAi: false,
              model: 'deepseek-v4-pro',
              apiBaseUrl: 'https://translation.example.com/v1',
            },
          },
        },
        aiApiKey: 'shared-key',
        translationApiKey: 'translation-key',
      },
    });

    expect(scopes).toEqual({
      summary: true,
      translation: true,
      digest: true,
    });
  });
});
