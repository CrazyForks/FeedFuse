# AI 深度思考开关实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 AI 设置新增“深度思考”开关，并在开启后让摘要、解读等页面内容只展示最终回复，不泄露思考文案。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — 跨层改动顺序与共享边界
- `.superwork/spec/guides/verification.md` — 本次前后端与共享层验证基线
- `.superwork/spec/frontend/contracts.md` — 设置中心、ArticleView 与流式摘要契约
- `.superwork/spec/frontend/quality.md` — 前端交互与 hook 回归要求
- `.superwork/spec/backend/contracts.md` — AI 提示词、配置指纹与 route/service 边界
- `.superwork/spec/backend/quality.md` — API 与 AI 集成测试门槛

**Architecture:** 配置层把 `deepThinkingEnabled` 持久化到 `ui_settings.ai`，前端设置中心负责编辑与保存。AI 集成层统一追加“只输出最终结果”的约束，并在服务端清洗 `<think>` 一类思考片段；流式摘要在 worker 侧只广播清洗后的可见文本，避免前端先看到再隐藏。

**Tech Stack:** TypeScript, React, Zustand, Next.js Route Handlers, Vitest

---

### Task 1: 持久化 AI 深度思考设置

**Files:**

- Modify: `src/types/index.ts`
- Modify: `src/features/settings/settingsSchema.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/features/settings/panels/AISettingsPanel.tsx`
- Test: `src/test/features/settings/settingsSchema.test.ts`
- Test: `src/test/features/settings/panels/AISettingsPanel.test.tsx`
- Test: `src/test/store/settingsStore.test.ts`

- [ ] **Step 1: 先写设置层失败测试**

```ts
expect(normalizePersistedSettings({ ai: { deepThinkingEnabled: true } }).ai.deepThinkingEnabled).toBe(true);
expect(lastSettingsPutBodyText).toContain('"deepThinkingEnabled":true');
expect(screen.getByRole('switch', { name: '启用深度思考' })).toBeInTheDocument();
```

- [ ] **Step 2: 实现类型、默认值与归一化**

```ts
export interface AIPersistedSettings {
  summaryEnabled: boolean;
  translateEnabled: boolean;
  autoSummarize: boolean;
  deepThinkingEnabled: boolean;
  model: string;
  apiBaseUrl: string;
  summaryPrompt: string;
  translationPrompt: string;
  translation: {
    useSharedAi: boolean;
    model: string;
    apiBaseUrl: string;
  };
}
```

- [ ] **Step 3: 在设置面板加入开关并补中文说明**

```tsx
<Switch
  aria-label="启用深度思考"
  checked={ai.deepThinkingEnabled}
  onCheckedChange={(checked) =>
    onChange((nextDraft) => {
      nextDraft.persisted.ai.deepThinkingEnabled = checked;
    })
  }
/>
```

- [ ] **Step 4: 运行设置相关测试**

Run: `pnpm test:unit -- src/test/features/settings/settingsSchema.test.ts src/test/features/settings/panels/AISettingsPanel.test.tsx src/test/store/settingsStore.test.ts`
Expected: PASS

### Task 2: 统一 AI 深度思考参数与最终输出清洗

**Files:**

- Create: `src/server/integrations/ai/deepThinking.ts`
- Modify: `src/server/integrations/ai/runtimeConfig.ts`
- Modify: `src/server/integrations/ai/translationConfig.ts`
- Modify: `src/server/integrations/ai/configFingerprints.ts`
- Modify: `src/server/integrations/ai/streamSummarizeText.ts`
- Modify: `src/server/integrations/ai/summarizeText.ts`
- Modify: `src/server/integrations/ai/translateTitle.ts`
- Modify: `src/server/integrations/ai/translateHtml.ts`
- Modify: `src/server/integrations/ai/bilingualHtmlTranslator.ts`
- Modify: `src/server/integrations/ai/aiDigestCompose.ts`
- Modify: `src/server/integrations/ai/aiDigestRerank.ts`
- Modify: `src/server/integrations/ai/articleFilterJudge.ts`
- Test: `src/test/server/ai/streamSummarizeText.test.ts`

- [ ] **Step 1: 先补 AI 集成层失败测试**

```ts
expect(request.reasoning_effort).toBe('high');
expect(systemPrompt).toContain('不要输出思考过程');
expect(result).toEqual(['结论', '\n- 要点']);
```

- [ ] **Step 2: 新增统一 helper，封装推理参数和思考清洗**

```ts
export function applyDeepThinkingToChatRequest(
  request: Parameters<OpenAI['chat']['completions']['create']>[0],
  enabled: boolean,
) {
  if (enabled) {
    (request as Record<string, unknown>).reasoning_effort = 'high';
  }
  return request;
}

export function stripThinkingText(value: string): string {
  return value.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}
```

- [ ] **Step 3: 把 deepThinkingEnabled 接进 runtime config 与所有 AI 请求**

```ts
return {
  model: trim(input.settings.ai.model),
  apiBaseUrl: trim(input.settings.ai.apiBaseUrl),
  apiKey: trim(input.aiApiKey),
  deepThinkingEnabled: Boolean(input.settings.ai.deepThinkingEnabled),
};
```

- [ ] **Step 4: 在摘要、翻译、解读、筛选调用里追加“仅输出最终结果”约束并清洗最终文本**

```ts
content: buildFinalOnlySystemPrompt(basePrompt, input.deepThinkingEnabled)
```

Run: `pnpm test:unit -- src/test/server/ai/streamSummarizeText.test.ts`
Expected: PASS

### Task 3: 摘要流式链路只显示最终回复并补回归

**Files:**

- Modify: `src/worker/aiSummaryStreamWorker.ts`
- Modify: `src/features/articles/hooks/useStreamingAiSummary.ts`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Modify: `src/worker/aiDigestGenerate.ts`
- Test: `src/test/features/articles/useStreamingAiSummary.test.ts`
- Test: `src/test/features/articles/ArticleView.aiSummary.test.tsx`
- Test: `src/test/app/api/settings/routes.test.ts`

- [ ] **Step 1: 先写摘要流与页面回归测试**

```ts
fakeEventSource.emit('summary.delta', { deltaText: '<think>分析</think>结论' });
expect(result.current.session?.draftText).toBe('结论');
expect(screen.queryByText('分析')).not.toBeInTheDocument();
```

- [ ] **Step 2: 在 worker 侧按增量过滤思考片段，只写入可见草稿与 finalText**

```ts
const visibleDelta = outputFilter.push(deltaText);
if (!visibleDelta) continue;
draftText += visibleDelta;
```

- [ ] **Step 3: 保证解读正文也只落清洗后的 HTML/summary**

```ts
const sanitized = input.deps.sanitizeContent(stripThinkingText(composed.html));
```

- [ ] **Step 4: 运行 AI 摘要、设置 API 与页面回归**

Run: `pnpm test:unit -- src/test/features/articles/useStreamingAiSummary.test.ts src/test/features/articles/ArticleView.aiSummary.test.tsx src/test/app/api/settings/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 运行基线检查**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 6: 运行类型检查**

Run: `pnpm type-check`
Expected: PASS
