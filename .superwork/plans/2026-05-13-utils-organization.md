# Utils 目录治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一 utils 放置规则：全局公共工具保留在 `src/utils`，业务工具统一放在各自 `src/features/<domain>/utils`。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md`
- `.superwork/spec/frontend/index.md`
- `.superwork/spec/frontend/structure.md`
- `.superwork/spec/shared/index.md`

**Architecture:** 只迁移明确属于工具函数/常量/模型构建的文件，不改行为逻辑。迁移后建立业务 `utils/index.ts` 聚合出口，统一修复业务代码与测试引用路径。

**Tech Stack:** TypeScript, pnpm, Vitest

---

### Task 1: 迁移业务 utils 到各域 `utils` 目录

**Files:**
- `src/features/articles/articleFilterReason.ts` -> `src/features/articles/utils/articleFilterReason.ts`
- `src/features/articles/articleListModel.ts` -> `src/features/articles/utils/articleListModel.ts`
- `src/features/articles/articleMarkdownExport.ts` -> `src/features/articles/utils/articleMarkdownExport.ts`
- `src/features/articles/articleOutline.ts` -> `src/features/articles/utils/articleOutline.ts`
- `src/features/articles/articleVirtualWindow.ts` -> `src/features/articles/utils/articleVirtualWindow.ts`
- `src/features/articles/immersiveRender.ts` -> `src/features/articles/utils/immersiveRender.ts`
- `src/features/feeds/aiDigestSourceTree.utils.ts` -> `src/features/feeds/utils/aiDigestSourceTree.utils.ts`
- `src/features/reader/globalSearch.ts` -> `src/features/reader/utils/globalSearch.ts`
- `src/features/reader/readerLayoutSizing.ts` -> `src/features/reader/utils/readerLayoutSizing.ts`
- `src/features/settings/validateSettingsDraft.ts` -> `src/features/settings/utils/validateSettingsDraft.ts`

### Task 2: 建立 utils 聚合出口并修复引用

**Files:**
- Create: `src/features/articles/utils/index.ts`
- Create: `src/features/feeds/utils/index.ts`
- Create: `src/features/reader/utils/index.ts`
- Create: `src/features/settings/utils/index.ts`
- Modify: `src/features/**` 与 `src/test/**` 相关 import

### Task 3: 验证

- `pnpm test:unit -- --run src/test/features/articles/ArticleList.test.tsx src/test/features/articles/ArticleView.outline.test.tsx src/test/features/feeds/aiDigestSourceTree.utils.test.ts src/test/features/reader/globalSearch.test.ts src/test/features/settings/validateSettingsDraft.test.ts src/test/features/settings/settingsSchema.test.ts`
- `pnpm lint && pnpm type-check`
