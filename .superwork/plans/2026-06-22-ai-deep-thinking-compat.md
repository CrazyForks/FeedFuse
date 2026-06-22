# AI 深度思考兼容 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 FeedFuse 在保留现有 `openai` SDK 的前提下，按不同 AI provider 的深度思考协议发送请求并正确过滤最终可见输出。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — cross-layer change order for AI runtime config and integration code
- `.superwork/spec/backend/index.md` — backend verification checklist for AI integration changes
- `.superwork/spec/backend/contracts.md` — deep thinking contract, final-only output contract, and stream/session persistence rules
- `.superwork/spec/backend/structure.md` — AI integration files stay under `src/server/integrations/ai/**`
- `.superwork/spec/shared/index.md` — shared helper placement and verification scope
- `.superwork/spec/shared/structure.md` — keep reusable compatibility helpers in stable shared locations

**Architecture:** 保留现有 `openai` SDK 和 `chat.completions.create` 调用方式，不引入新的大依赖。新增一个 provider-aware compatibility helper，集中做 base URL / model 推断、思考参数注入、响应解析与流式 delta 提取；现有摘要、翻译、过滤与 digest 调用方只消费这个统一层。

**Tech Stack:** TypeScript, Next.js, `openai`, Vitest

---

### Task 1: 建立 AI provider 深度思考兼容层

**Files:**

- Create: `src/server/integrations/ai/providerCompatibility.ts`
- Test: `src/test/server/ai/providerCompatibility.test.ts`

- [ ] **Step 1: 先写兼容层测试，固定 DeepSeek / OpenAI 的差异行为**

```ts
import { describe, expect, it } from 'vitest';
import {
  applyProviderThinkingConfig,
  extractAssistantText,
  extractStreamTextDelta,
} from '@/server/integrations/ai/providerCompatibility';

describe('providerCompatibility', () => {
  it('adds DeepSeek thinking payload and strips unsupported temperature knobs', () => {
    const request = applyProviderThinkingConfig({
      apiBaseUrl: 'https://api.deepseek.com',
      model: 'deepseek-v4-pro',
      deepThinkingEnabled: true,
      request: {
        model: 'deepseek-v4-pro',
        temperature: 0.2,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.reasoning_effort).toBe('high');
    expect((request as Record<string, unknown>).thinking).toEqual({ type: 'enabled' });
    expect('temperature' in request).toBe(false);
  });

  it('keeps OpenAI requests on reasoning_effort only', () => {
    const request = applyProviderThinkingConfig({
      apiBaseUrl: 'https://api.openai.com/v1',
      model: 'gpt-5.5',
      deepThinkingEnabled: true,
      request: {
        model: 'gpt-5.5',
        temperature: 0.2,
        messages: [{ role: 'user', content: 'hello' }],
      },
    });

    expect(request.reasoning_effort).toBe('high');
    expect((request as Record<string, unknown>).thinking).toBeUndefined();
    expect(request.temperature).toBe(0.2);
  });

  it('prefers content but falls back to reasoning_content when provider only returns thinking text', () => {
    expect(extractAssistantText({ content: '最终答案', reasoning_content: '思考过程' })).toBe('最终答案');
    expect(extractAssistantText({ content: '', reasoning_content: '<think>分析</think>最终答案' })).toBe('最终答案');
  });

  it('reads streaming content and ignores pure reasoning deltas', () => {
    expect(extractStreamTextDelta({ choices: [{ delta: { reasoning_content: '先分析' } }] })).toBe('');
    expect(extractStreamTextDelta({ choices: [{ delta: { content: '最终答案' } }] })).toBe('最终答案');
  });
});
```

- [ ] **Step 2: 跑测试确认当前仓库缺少这层能力**

Run: `pnpm test:unit -- src/test/server/ai/providerCompatibility.test.ts`
Expected: FAIL with `Cannot find module '@/server/integrations/ai/providerCompatibility'`

- [ ] **Step 3: 实现 provider-aware helper，集中处理请求与响应归一化**

```ts
const DEEPSEEK_HOST_RE = /(^|\.)deepseek\.com$/i;

type ChatRequest = OpenAI.Chat.ChatCompletionCreateParams;

function isDeepSeekProvider(apiBaseUrl: string, model: string): boolean {
  const host = safeHostname(apiBaseUrl);
  return DEEPSEEK_HOST_RE.test(host) || model.toLowerCase().startsWith('deepseek');
}

export function applyProviderThinkingConfig(input: {
  apiBaseUrl: string;
  model: string;
  deepThinkingEnabled: boolean;
  request: ChatRequest;
}): ChatRequest {
  const request = { ...input.request };
  if (!input.deepThinkingEnabled) return request;

  request.reasoning_effort = 'high';

  if (isDeepSeekProvider(input.apiBaseUrl, input.model)) {
    // DeepSeek 思考模式默认开启，这里显式声明，避免不同兼容层默认值漂移。
    (request as Record<string, unknown>).thinking = { type: 'enabled' };
    delete (request as Partial<ChatRequest>).temperature;
    delete (request as Partial<ChatRequest>).top_p;
    delete (request as Partial<ChatRequest>).presence_penalty;
    delete (request as Partial<ChatRequest>).frequency_penalty;
  }

  return request;
}

export function extractAssistantText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';
  const content = typeof (message as { content?: unknown }).content === 'string'
    ? (message as { content: string }).content
    : '';
  const reasoningContent = typeof (message as { reasoning_content?: unknown }).reasoning_content === 'string'
    ? (message as { reasoning_content: string }).reasoning_content
    : '';
  return stripThinkingText(content || reasoningContent);
}

export function extractStreamTextDelta(chunk: unknown): string {
  const delta = (chunk as {
    choices?: Array<{ delta?: { content?: unknown; reasoning_content?: unknown } }>;
  })?.choices?.[0]?.delta;
  return typeof delta?.content === 'string' ? delta.content : '';
}
```

- [ ] **Step 4: 跑新增测试确认兼容层成立**

Run: `pnpm test:unit -- src/test/server/ai/providerCompatibility.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/integrations/ai/providerCompatibility.ts src/test/server/ai/providerCompatibility.test.ts
git commit -m "feat(ai): 添加深度思考兼容层" -m $'- 添加 provider 感知的思考参数适配\n- 统一提取最终可见文本与流式增量'
```

### Task 2: 让 AI 集成统一走兼容层

**Files:**

- Modify: `src/server/integrations/ai/deepThinking.ts`
- Modify: `src/server/integrations/ai/streamSummarizeText.ts`
- Modify: `src/server/integrations/ai/summarizeText.ts`
- Modify: `src/server/integrations/ai/translateHtml.ts`
- Modify: `src/server/integrations/ai/translateTitle.ts`
- Modify: `src/server/integrations/ai/bilingualHtmlTranslator.ts`
- Modify: `src/server/integrations/ai/articleFilterJudge.ts`
- Modify: `src/server/integrations/ai/aiDigestCompose.ts`
- Modify: `src/server/integrations/ai/aiDigestRerank.ts`
- Test: `src/test/server/ai/streamSummarizeText.test.ts`
- Test: `src/test/server/ai/summarizeText.test.ts`
- Test: `src/test/server/ai/translateTitle.test.ts`
- Test: `src/test/server/ai/articleFilterJudge.test.ts`
- Test: `src/test/server/ai/aiDigestCompose.test.ts`
- Test: `src/test/server/ai/aiDigestRerank.test.ts`

- [ ] **Step 1: 先补一组 DeepSeek 兼容回归测试**

```ts
it('adds DeepSeek thinking payload for streaming summary requests', async () => {
  createCompletionMock.mockResolvedValue(fakeOpenAiStream([{ content: '结论' }]));
  const mod = await import('@/server/integrations/ai/streamSummarizeText');

  for await (const _ of mod.streamSummarizeText({
    apiBaseUrl: 'https://api.deepseek.com',
    apiKey: 'key',
    model: 'deepseek-v4-pro',
    text: 'hello',
    deepThinkingEnabled: true,
  })) {
    // consume
  }

  const request = createCompletionMock.mock.calls[0]?.[0];
  expect(request.reasoning_effort).toBe('high');
  expect(request.thinking).toEqual({ type: 'enabled' });
  expect(request.temperature).toBeUndefined();
});

it('parses DeepSeek reasoning_content fallback in non-stream requests', async () => {
  createCompletionMock.mockResolvedValue({
    choices: [{ message: { content: '', reasoning_content: '<think>分析</think>最终答案' } }],
  });
  const { summarizeText } = await import('@/server/integrations/ai/summarizeText');
  await expect(summarizeText({
    apiBaseUrl: 'https://api.deepseek.com',
    apiKey: 'key',
    model: 'deepseek-v4-pro',
    text: 'hello',
    deepThinkingEnabled: true,
  })).resolves.toBe('最终答案');
});
```

- [ ] **Step 2: 跑相关 AI 测试，确认现状会在 DeepSeek 协议上失败**

Run: `pnpm test:unit -- src/test/server/ai/streamSummarizeText.test.ts src/test/server/ai/summarizeText.test.ts src/test/server/ai/translateTitle.test.ts src/test/server/ai/articleFilterJudge.test.ts`
Expected: FAIL on missing `thinking` injection and `reasoning_content` fallback assertions

- [ ] **Step 3: 把所有 AI 调用改为复用兼容层**

```ts
const request = applyProviderThinkingConfig({
  apiBaseUrl: input.apiBaseUrl,
  model: input.model,
  deepThinkingEnabled: Boolean(input.deepThinkingEnabled),
  request: {
    model: input.model,
    temperature: 0.2,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: input.text },
    ],
  },
});

const completion = await client.chat.completions.create(request);
const content = extractAssistantText(completion.choices?.[0]?.message);
```

```ts
for await (const chunk of stream) {
  const delta = extractStreamTextDelta(chunk);
  if (delta) {
    yield delta;
  }
}
```

- [ ] **Step 4: 跑受影响的 AI 单测确认统一层没有打破现有行为**

Run: `pnpm test:unit -- src/test/server/ai/providerCompatibility.test.ts src/test/server/ai/streamSummarizeText.test.ts src/test/server/ai/summarizeText.test.ts src/test/server/ai/translateTitle.test.ts src/test/server/ai/articleFilterJudge.test.ts src/test/server/ai/aiDigestCompose.test.ts src/test/server/ai/aiDigestRerank.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/server/integrations/ai/deepThinking.ts src/server/integrations/ai/streamSummarizeText.ts src/server/integrations/ai/summarizeText.ts src/server/integrations/ai/translateHtml.ts src/server/integrations/ai/translateTitle.ts src/server/integrations/ai/bilingualHtmlTranslator.ts src/server/integrations/ai/articleFilterJudge.ts src/server/integrations/ai/aiDigestCompose.ts src/server/integrations/ai/aiDigestRerank.ts src/test/server/ai/streamSummarizeText.test.ts src/test/server/ai/summarizeText.test.ts src/test/server/ai/translateTitle.test.ts src/test/server/ai/articleFilterJudge.test.ts src/test/server/ai/aiDigestCompose.test.ts src/test/server/ai/aiDigestRerank.test.ts
git commit -m "fix(ai): 统一多模型思考协议" -m $'- 更新 AI 请求构造以适配 DeepSeek 思考模式\n- 统一从 content 与 reasoning_content 提取最终结果'
```

### Task 3: 校验摘要流和最终持久化链路

**Files:**

- Modify: `src/worker/aiSummaryStreamWorker.ts`
- Test: `src/test/worker/aiSummaryStreamWorker.test.ts`

- [ ] **Step 1: 先补 worker 侧回归测试，确保只持久化最终可见文本**

```ts
it('ignores reasoning-only stream deltas before persisting summary text', async () => {
  streamSummarizeTextMock.mockResolvedValue((async function* () {
    yield '';
    yield '最终';
    yield '答案';
  })());

  await runWorker();

  expect(insertAiSummaryEventMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({
      eventType: 'summary.delta',
      payload: { deltaText: '最终' },
    }),
  );
  expect(completeAiSummarySessionMock).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ finalText: '最终答案' }),
  );
});
```

- [ ] **Step 2: 跑 worker 测试确认链路约束成立**

Run: `pnpm test:unit -- src/test/worker/aiSummaryStreamWorker.test.ts`
Expected: PASS

- [ ] **Step 3: 如有必要，仅补一处中文注释说明为什么流式阶段要丢弃 reasoning-only delta**

```ts
// DeepSeek 一类 provider 会把思考内容放在 reasoning_content，
// 这里仅持久化最终可见文本，避免中间推理进入 SSE 与数据库。
const visibleDeltaText = thinkingFilter.push(deltaText);
```

- [ ] **Step 4: 运行本次改动的最终验证**

Run: `pnpm test:unit -- src/test/server/ai/providerCompatibility.test.ts src/test/server/ai/streamSummarizeText.test.ts src/test/server/ai/summarizeText.test.ts src/test/server/ai/translateTitle.test.ts src/test/server/ai/articleFilterJudge.test.ts src/test/server/ai/aiDigestCompose.test.ts src/test/server/ai/aiDigestRerank.test.ts src/test/worker/aiSummaryStreamWorker.test.ts`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/worker/aiSummaryStreamWorker.ts src/test/worker/aiSummaryStreamWorker.test.ts
git commit -m "test(ai): 覆盖思考流持久化约束" -m $'- 添加摘要流仅保存最终文本的回归测试\n- 约束思考内容不进入事件流与数据库'
```
