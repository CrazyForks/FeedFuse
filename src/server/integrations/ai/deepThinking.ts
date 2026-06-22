const THINK_BLOCK_RE = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
const OPEN_THINK_TAIL_RE = /<think(?:ing)?>[\s\S]*$/i;
const STRAY_THINK_TAG_RE = /<\/?think(?:ing)?>/gi;
const THINK_TAGS = ['<think>', '</think>', '<thinking>', '</thinking>'] as const;

function stripPartialThinkingTagTail(value: string): string {
  const lower = value.toLowerCase();

  for (const tag of THINK_TAGS) {
    for (let length = Math.min(tag.length - 1, lower.length); length > 0; length -= 1) {
      if (lower.endsWith(tag.slice(0, length))) {
        return value.slice(0, -length);
      }
    }
  }

  return value;
}

function sanitizeThinkingText(value: string): string {
  return stripPartialThinkingTagTail(
    value
      .replace(THINK_BLOCK_RE, '')
      .replace(OPEN_THINK_TAIL_RE, '')
      .replace(STRAY_THINK_TAG_RE, ''),
  );
}

export function stripThinkingText(value: string): string {
  return sanitizeThinkingText(value).trim();
}

export function buildFinalOnlySystemPrompt(basePrompt: string, enabled: boolean): string {
  if (!enabled) {
    return basePrompt;
  }

  return `${basePrompt}\n\n请先充分思考，再只输出最终结果，不要输出思考过程、推理步骤、思维链、<think> 标签或额外分析。`;
}

export function createThinkingDeltaFilter() {
  let rawText = '';
  let visibleText = '';

  return {
    push(chunk: string): string {
      rawText += chunk;
      const nextVisibleText = sanitizeThinkingText(rawText);

      if (!nextVisibleText.startsWith(visibleText)) {
        const delta = nextVisibleText;
        visibleText = nextVisibleText;
        return delta;
      }

      const delta = nextVisibleText.slice(visibleText.length);
      visibleText = nextVisibleText;
      return delta;
    },
    getVisibleText(): string {
      return stripThinkingText(visibleText);
    },
  };
}
