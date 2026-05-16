# AI 摘要与翻译提示词可配置 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 摘要与翻译提示词暴露到设置中心并持久化，调用链统一读取用户配置提示词。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与校验要求
- `.superwork/spec/guides/repo-map.md` — 仓库分层与目录职责
- `.superwork/spec/guides/verification.md` — 本次改动验证命令基线
- `.superwork/spec/guides/change-boundaries.md` — 前后端与 worker 边界
- `.superwork/spec/frontend/contracts.md` — 设置中心与前端 API 使用约束
- `.superwork/spec/backend/contracts.md` — route/worker/ai 模块职责边界

**Architecture:** 在 `AIPersistedSettings` 增加 `summaryPrompt`、`translationPrompt` 两个持久化字段，设置页提供可编辑文本框。后端 AI 能力层增加统一默认提示词常量与解析函数，摘要与翻译调用时优先使用用户配置，否则回退默认值。

**Tech Stack:** TypeScript, Next.js Route Handlers, Zustand, Vitest

---

### Task 1: 扩展设置模型与 AI 提示词解析

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/features/settings/settingsSchema.ts`
- Create: `src/server/ai/promptTemplates.ts`
- Modify: `src/server/ai/streamSummarizeText.ts`
- Modify: `src/server/ai/summarizeText.ts`
- Modify: `src/server/ai/translateHtml.ts`
- Modify: `src/server/ai/translateTitle.ts`
- Modify: `src/server/ai/bilingualHtmlTranslator.ts`
- Modify: `src/worker/aiSummaryStreamWorker.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: 先写失败测试，覆盖“未配置回退默认、已配置走自定义”**

```ts
// src/server/ai/streamSummarizeText.test.ts
// 断言 messages[0].content 使用 input.prompt，并在 prompt 为空时使用默认摘要提示词。
```

```ts
// src/server/ai/translateTitle.test.ts
// 断言 system prompt 由 translationPrompt 生成，并保留“仅输出翻译结果”约束。
```

- [ ] **Step 2: 运行目标测试确认失败**

Run: `pnpm test:unit -- --run src/server/ai/streamSummarizeText.test.ts src/server/ai/translateTitle.test.ts`
Expected: FAIL，提示新增字段/参数或提示词断言不匹配。

- [ ] **Step 3: 实现最小通过代码**

```ts
// src/server/ai/promptTemplates.ts
export const DEFAULT_SUMMARY_PROMPT = '...';
export const DEFAULT_TRANSLATION_PROMPT = '...';
export function resolveSummaryPrompt(input?: string): string { ... }
export function buildTranslationSystemPrompt(input: { basePrompt?: string; taskInstruction: string }): string { ... }
```

```ts
// 在 streamSummarizeText/summarizeText/translateTitle/translateHtml/bilingualHtmlTranslator
// 增加可选 prompt 参数，并改为通过 promptTemplates 生成 system prompt。
```

```ts
// 在 worker 调用处把 normalizePersistedSettings(uiSettings).ai.summaryPrompt / translationPrompt 传入。
```

- [ ] **Step 4: 运行目标测试确认通过**

Run: `pnpm test:unit -- --run src/server/ai/streamSummarizeText.test.ts src/server/ai/translateTitle.test.ts`
Expected: PASS

### Task 2: 设置页增加提示词编辑与持久化

**Files:**
- Modify: `src/features/settings/panels/AISettingsPanel.tsx`
- Modify: `src/features/settings/panels/AISettingsPanel.test.tsx`
- Modify: `src/features/settings/settingsSchema.test.ts`
- Modify: `src/store/settingsStore.ts` (仅兼容补全，无行为改变)

- [ ] **Step 1: 先写失败测试，覆盖“设置页可编辑并写入 draft”**

```tsx
// src/features/settings/panels/AISettingsPanel.test.tsx
// 渲染后输入“摘要提示词”“翻译提示词”，断言 onChange 更新 draft.persisted.ai.summaryPrompt / translationPrompt。
```

- [ ] **Step 2: 运行目标测试确认失败**

Run: `pnpm test:unit -- --run src/features/settings/panels/AISettingsPanel.test.tsx src/features/settings/settingsSchema.test.ts`
Expected: FAIL，找不到新增字段或 UI 控件。

- [ ] **Step 3: 实现最小通过代码**

```tsx
// AISettingsPanel.tsx
// 新增两个 Textarea：摘要提示词、翻译提示词；
// onChange 写入 draft.persisted.ai.summaryPrompt / translationPrompt。
```

```ts
// settingsSchema.ts
const defaultAISettings = { ..., summaryPrompt: '', translationPrompt: '' }
// normalizeAISettings 读取并 trim 这两个字段。
```

- [ ] **Step 4: 运行目标测试确认通过**

Run: `pnpm test:unit -- --run src/features/settings/panels/AISettingsPanel.test.tsx src/features/settings/settingsSchema.test.ts`
Expected: PASS

### Task 3: 回归验证

**Files:**
- Test only

- [ ] **Step 1: 运行分层回归（server+worker+settings）**

Run: `pnpm test:unit -- --run src/server/ai/streamSummarizeText.test.ts src/server/ai/translateTitle.test.ts src/server/ai/translateHtml.test.ts src/server/ai/bilingualHtmlTranslator.test.ts src/features/settings/settingsSchema.test.ts src/features/settings/panels/AISettingsPanel.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行静态校验**

Run: `pnpm lint && pnpm type-check`
Expected: PASS
