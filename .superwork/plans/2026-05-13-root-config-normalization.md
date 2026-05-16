# Root Config 归一化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将可迁移的根目录工具配置集中到 `config/` 目录，同时保留根目录必要入口以确保 Next.js、ESLint、Vitest、TypeScript、PostCSS 命令行为不变。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与验证基线
- `.superwork/spec/guides/repo-map.md` — 仓库结构与运行入口
- `.superwork/spec/guides/change-boundaries.md` — 跨层边界约束
- `.superwork/spec/frontend/index.md` — 前端验证清单（Next/Vitest）
- `.superwork/spec/shared/index.md` — 共享层验证清单（TS/工具配置）

**Architecture:** 采用“配置实体下沉 + 根入口转发”策略：把实际配置内容迁入 `config/` 子目录，根目录仅保留最小转发文件以兼容工具默认查找路径。TypeScript 采用 `extends` 连接新的基础配置，避免重复维护。全过程不改业务代码，仅做配置结构治理。

**Tech Stack:** Node.js, pnpm, Next.js, ESLint, TypeScript, Vitest, PostCSS

---

### Task 1: 建立统一配置目录并迁移配置实体

**Files:**

- Create: `config/eslint/eslint.config.js`
- Create: `config/next/next.config.mjs`
- Create: `config/postcss/postcss.config.mjs`
- Create: `config/vitest/vitest.config.ts`
- Create: `config/typescript/tsconfig.base.json`

- [ ] **Step 1: 创建统一配置目录结构**

Run: `mkdir -p config/{eslint,next,postcss,vitest,typescript}`
Expected: 新目录创建成功

- [ ] **Step 2: 迁移 ESLint / Next / PostCSS / Vitest 配置实体**

```js
// 示例：config/next/next.config.mjs
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },
};

export default nextConfig;
```

Expected: 配置主体代码从根目录迁入 `config/`，语义保持不变

- [ ] **Step 3: 提取 TypeScript 基础配置**

```json
{
  "compilerOptions": {
    "target": "ES2022"
  }
}
```

Expected: 形成 `config/typescript/tsconfig.base.json` 作为统一 TS 基础配置

### Task 2: 根目录保留兼容入口并接回引用

**Files:**

- Modify: `eslint.config.js`
- Modify: `next.config.mjs`
- Modify: `postcss.config.mjs`
- Modify: `vitest.config.ts`
- Modify: `tsconfig.json`
- Modify: `tsconfig.typecheck.json`

- [ ] **Step 1: 根目录配置改为转发入口**

```js
// 示例：eslint.config.js
export { default } from './config/eslint/eslint.config.js';
```

Expected: 工具仍可通过根目录默认文件名加载配置

- [ ] **Step 2: 根目录 tsconfig 改为 extends 统一基础配置**

```json
{
  "extends": "./config/typescript/tsconfig.base.json"
}
```

Expected: `tsc` 与 `next` 仍可在根目录读取 `tsconfig.json`，并继承统一配置

- [ ] **Step 3: 修正迁移后相对路径**

Run: `pnpm type-check`
Expected: PASS，确保 `paths`、`include`、Vitest `alias/setupFiles` 仍可解析

### Task 3: 回归验证

**Files:**

- Test: `pnpm lint`
- Test: `pnpm type-check`
- Test: `pnpm test:unit -- --run src/test/lib/markdown/markdownSanitizer.test.ts`

- [ ] **Step 1: 执行 lint 与类型检查**

Run: `pnpm lint && pnpm type-check`
Expected: PASS

- [ ] **Step 2: 执行一条代表性单测确认 Vitest 配置可用**

Run: `pnpm test:unit -- --run src/test/lib/markdown/markdownSanitizer.test.ts`
Expected: PASS
