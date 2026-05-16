# Components 目录治理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一组件放置规则：公共组件继续归 `src/components/**`，业务组件归 `src/features/<domain>/components/**`，并修复全部引用路径。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与验证基线
- `.superwork/spec/frontend/index.md` — 前端范围与验证清单
- `.superwork/spec/frontend/structure.md` — 前端目录放置规则

**Architecture:** 采用“先迁移文件、再修复引用、最后验证”的无行为变更重构路径。每个业务域建立 `components` 目录并迁移根目录组件文件，保留业务逻辑与 API 不变。统一补充 `index.ts` 聚合出口，减少后续组件路径散落。

**Tech Stack:** TypeScript, React, Next.js, pnpm, Vitest

---

### Task 1: 迁移业务组件到各自 `components` 目录

**Files:**

- Modify: `src/features/articles/*.tsx` -> `src/features/articles/components/*.tsx`
- Modify: `src/features/auth/LoginPage.tsx` -> `src/features/auth/components/LoginPage.tsx`
- Modify: `src/features/feeds/*.tsx` -> `src/features/feeds/components/*.tsx`
- Modify: `src/features/reader/GlobalSearchDialog.tsx` -> `src/features/reader/components/GlobalSearchDialog.tsx`
- Modify: `src/features/reader/ReaderLayout.tsx` -> `src/features/reader/components/ReaderLayout.tsx`
- Modify: `src/features/reader/ReaderToolbarIconButton.tsx` -> `src/features/reader/components/ReaderToolbarIconButton.tsx`
- Modify: `src/features/reader/ResizeHandle.tsx` -> `src/features/reader/components/ResizeHandle.tsx`
- Modify: `src/features/settings/SettingsCenterDrawer.tsx` -> `src/features/settings/components/SettingsCenterDrawer.tsx`
- Modify: `src/features/settings/SettingsCenterModal.tsx` -> `src/features/settings/components/SettingsCenterModal.tsx`
- Modify: `src/features/toast/ToastHost.tsx` -> `src/features/toast/components/ToastHost.tsx`

- [ ] **Step 1: 创建业务组件目录**

Run: `mkdir -p src/features/{articles,auth,feeds,reader,toast}/components src/features/settings/components`
Expected: 目录创建成功

- [ ] **Step 2: 批量迁移组件文件**

Run: `mv ...`
Expected: 组件文件迁移完成，旧路径不再存在

### Task 2: 聚合导出并修复引用

**Files:**

- Create: `src/features/articles/components/index.ts`
- Create: `src/features/auth/components/index.ts`
- Create: `src/features/feeds/components/index.ts`
- Create: `src/features/reader/components/index.ts`
- Create: `src/features/settings/components/index.ts`
- Create: `src/features/toast/components/index.ts`
- Modify: `src/app/(reader)/ReaderApp.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/features/**` 内引用文件
- Modify: `src/test/**` 相关测试引用

- [ ] **Step 1: 新建各业务组件聚合导出文件**

```ts
// 示例
// 业务组件统一出口，避免组件路径在业务内散落。
export { default as ReaderLayout } from './ReaderLayout';
```

- [ ] **Step 2: 批量修复业务代码 import 路径**

Run: `perl -pi -e 's#旧路径#新路径#g' ...`
Expected: 编译路径可解析

- [ ] **Step 3: 批量修复测试 import 路径**

Run: `perl -pi -e 's#旧路径#新路径#g' src/test/**/*.ts*`
Expected: 测试可加载模块

### Task 3: 验证与收尾

**Files:**

- Test: `src/test/features/reader/ReaderLayout.test.tsx`
- Test: `src/test/features/feeds/FeedList.test.tsx`
- Test: `src/test/features/settings/SettingsCenterModal.test.tsx`
- Test: `src/test/features/toast/ToastHost.test.tsx`
- Test: `src/test/features/articles/ArticleView.aiSummary.test.tsx`

- [ ] **Step 1: 运行相关回归测试**

Run: `pnpm test:unit -- --run src/test/features/reader/ReaderLayout.test.tsx src/test/features/feeds/FeedList.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/toast/ToastHost.test.tsx src/test/features/articles/ArticleView.aiSummary.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行静态检查**

Run: `pnpm lint && pnpm type-check`
Expected: PASS
