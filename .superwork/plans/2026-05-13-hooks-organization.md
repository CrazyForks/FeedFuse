# Hooks 目录治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一自定义 hooks 的目录结构，让公共 hooks 归于 `src/hooks`，业务与组件私有 hooks 归于各自 `hooks` 子目录，并修复全部引用与测试路径。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与检查清单
- `.superwork/spec/guides/repo-map.md` — 仓库目录职责
- `.superwork/spec/guides/change-boundaries.md` — 跨层边界规则
- `.superwork/spec/frontend/index.md` — 前端范围与验证清单
- `.superwork/spec/frontend/structure.md` — hooks 放置规则
- `.superwork/spec/shared/structure.md` — 共享模块判断标准

**Architecture:** 采用“先搬迁文件，再收敛公共 hook，最后统一改引用与验证”的三段式重构。业务 hooks 放入 `src/features/<domain>/hooks/`，组件 hooks 放入 `src/components/ui/hooks/`，跨 feature 复用 hook 放入 `src/hooks/`。不改动 hooks 行为，仅调整目录与 import 依赖，降低回归风险。

**Tech Stack:** TypeScript, React Hooks, Next.js, pnpm, Vitest

---

### Task 1: 业务与组件 hooks 收敛到就近 hooks 目录

**Files:**

- Modify: `src/features/articles/useImmersiveTranslation.ts` -> `src/features/articles/hooks/useImmersiveTranslation.ts`
- Modify: `src/features/articles/useStreamingAiSummary.ts` -> `src/features/articles/hooks/useStreamingAiSummary.ts`
- Modify: `src/features/articles/useAnimatedAiSummaryText.ts` -> `src/features/articles/hooks/useAnimatedAiSummaryText.ts`
- Modify: `src/features/feeds/useAiDigestDialogForm.ts` -> `src/features/feeds/hooks/useAiDigestDialogForm.ts`
- Modify: `src/features/feeds/useFeedDialogForm.ts` -> `src/features/feeds/hooks/useFeedDialogForm.ts`
- Modify: `src/features/settings/useSettingsAutosave.ts` -> `src/features/settings/hooks/useSettingsAutosave.ts`
- Modify: `src/components/ui/dialog-motion.ts` -> `src/components/ui/hooks/useDialogMotionContentProps.ts`

- [ ] **Step 1: 创建 hooks 子目录**

```bash
mkdir -p src/features/articles/hooks src/features/feeds/hooks src/features/settings/hooks src/components/ui/hooks
```

- [ ] **Step 2: 迁移业务 hooks 文件（保持实现不变）**

```bash
mv src/features/articles/useImmersiveTranslation.ts src/features/articles/hooks/useImmersiveTranslation.ts
mv src/features/articles/useStreamingAiSummary.ts src/features/articles/hooks/useStreamingAiSummary.ts
mv src/features/articles/useAnimatedAiSummaryText.ts src/features/articles/hooks/useAnimatedAiSummaryText.ts
mv src/features/feeds/useAiDigestDialogForm.ts src/features/feeds/hooks/useAiDigestDialogForm.ts
mv src/features/feeds/useFeedDialogForm.ts src/features/feeds/hooks/useFeedDialogForm.ts
mv src/features/settings/useSettingsAutosave.ts src/features/settings/hooks/useSettingsAutosave.ts
```

- [ ] **Step 3: 迁移组件私有 hook 到组件 hooks 目录**

```bash
mv src/components/ui/dialog-motion.ts src/components/ui/hooks/useDialogMotionContentProps.ts
```

- [ ] **Step 4: 验证旧路径文件已清理**

Run: `rg -n "useImmersiveTranslation|useStreamingAiSummary|useAnimatedAiSummaryText|useAiDigestDialogForm|useFeedDialogForm|useSettingsAutosave|useDialogMotionContentProps" src/features src/components/ui`
Expected: 仅剩新路径与引用，不再出现旧 hooks 文件路径

### Task 2: 可复用 hook 提升到公共 hooks

**Files:**

- Modify: `src/features/reader/useHydratedSelectedView.ts` -> `src/hooks/useHydratedSelectedView.ts`

- [ ] **Step 1: 迁移跨 feature 复用 hook 到公共目录**

```bash
mv src/features/reader/useHydratedSelectedView.ts src/hooks/useHydratedSelectedView.ts
```

- [ ] **Step 2: 验证目录职责符合共享规则**

Run: `rg -n "useHydratedSelectedView" src`
Expected: 定义位于 `src/hooks/useHydratedSelectedView.ts`，仅通过 import 被各 feature 复用

### Task 3: 全量修复 import 与测试路径

**Files:**

- Modify: `src/features/articles/ArticleView.tsx`
- Modify: `src/features/articles/ArticleList.tsx`
- Modify: `src/features/feeds/FeedList.tsx`
- Modify: `src/features/feeds/FeedDialog.tsx`
- Modify: `src/features/feeds/AiDigestDialog.tsx`
- Modify: `src/features/feeds/AiDigestDialogForm.tsx`
- Modify: `src/features/settings/SettingsCenterDrawer.tsx`
- Modify: `src/components/ui/dialog.tsx`
- Modify: `src/components/ui/alert-dialog.tsx`
- Test: `src/test/features/articles/useImmersiveTranslation.test.ts`
- Test: `src/test/features/articles/useStreamingAiSummary.test.ts`
- Test: `src/test/features/articles/useAnimatedAiSummaryText.test.ts`
- Test: `src/test/features/feeds/useAiDigestDialogForm.test.tsx`
- Test: `src/test/features/settings/useSettingsAutosave.test.ts`

- [ ] **Step 1: 批量更新业务代码 import**

```ts
// 例：articles 组件中
import { useImmersiveTranslation } from "./hooks/useImmersiveTranslation";
import { useAnimatedAiSummaryText } from "./hooks/useAnimatedAiSummaryText";
import { useStreamingAiSummary } from "./hooks/useStreamingAiSummary";

// 例：跨 feature 复用 hook
import { useHydratedSelectedView } from "../../hooks/useHydratedSelectedView";
```

- [ ] **Step 2: 更新组件 hook import**

```ts
import { useDialogMotionContentProps } from '@/components/ui/hooks/useDialogMotionContentProps';
```

- [ ] **Step 3: 批量更新测试 import 路径**

```ts
import { useStreamingAiSummary } from '../../../features/articles/hooks/useStreamingAiSummary';
import { useAiDigestDialogForm } from '../../../features/feeds/hooks/useAiDigestDialogForm';
import { useSettingsAutosave } from '../../../features/settings/hooks/useSettingsAutosave';
```

- [ ] **Step 4: 运行最小相关测试验证搬迁无行为变化**

Run: `pnpm test:unit -- --run src/test/features/articles/useImmersiveTranslation.test.ts src/test/features/articles/useStreamingAiSummary.test.ts src/test/features/articles/useAnimatedAiSummaryText.test.ts src/test/features/feeds/useAiDigestDialogForm.test.tsx src/test/features/settings/useSettingsAutosave.test.ts src/test/hooks/useTheme.test.tsx`
Expected: PASS

- [ ] **Step 5: 运行静态检查**

Run: `pnpm lint && pnpm type-check`
Expected: PASS
