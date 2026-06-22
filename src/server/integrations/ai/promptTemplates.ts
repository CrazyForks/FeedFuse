import { buildFinalOnlySystemPrompt } from '@/server/integrations/ai/deepThinking';

export const DEFAULT_SUMMARY_PROMPT =
  '你是中文摘要助手。请输出简洁中文摘要：先给 1-2 句总结，再给 3-5 条要点。不要返回“TL;DR：”或类似前缀。';

export const DEFAULT_TRANSLATION_PROMPT =
  '你是翻译助手。请将用户提供的内容翻译为简体中文（zh-CN），忠于原文，不要补充原文中不存在的信息。';

// 统一处理用户可编辑提示词：空值时回退到内置默认模板。
function normalizePrompt(input: string | undefined, fallback: string): string {
  const trimmed = input?.trim() ?? '';
  return trimmed || fallback;
}

export function resolveSummaryPrompt(input: string | undefined): string {
  return normalizePrompt(input, DEFAULT_SUMMARY_PROMPT);
}

export function buildTranslationSystemPrompt(input: {
  basePrompt: string | undefined;
  taskInstruction: string;
  deepThinkingEnabled?: boolean;
}): string {
  const normalized = normalizePrompt(input.basePrompt, DEFAULT_TRANSLATION_PROMPT);
  return buildFinalOnlySystemPrompt(
    `${normalized}\n\n${input.taskInstruction}`,
    Boolean(input.deepThinkingEnabled),
  );
}
