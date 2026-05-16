# 生产构建精简与优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理无引用资源与无用依赖，补充可复用的构建清理流程，并在不改行为的前提下优化生产构建产物。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与检查清单
- `.superwork/spec/guides/verification.md` — 验证命令与回归要求
- `.superwork/spec/frontend/index.md` — 前端构建与页面入口相关约束
- `.superwork/spec/shared/index.md` — 共享层清理与稳定性要求
- `.superwork/spec/backend/index.md` — 构建入口与脚本影响范围

**Architecture:** 先基于静态分析结果做低风险删除（无引用文件与依赖），再增强构建前清理脚本和 Next 构建配置注释，最后用 lint/type-check/build 进行整体验证。所有调整都限定在“无行为变化”的工程优化层。

**Tech Stack:** Next.js 16, TypeScript, pnpm, Vitest, ESLint, Knip

---

### Task 1: 清理无引用文件与资源入口

**Files:**
- Delete: `src/components/ui/scroll-area.tsx`
- Delete: `src/components/ui/separator.tsx`
- Delete: `src/components/ui/table.tsx`
- Delete: `src/features/articles/components/index.ts`
- Delete: `src/features/articles/index.ts`
- Delete: `src/features/auth/components/index.ts`
- Delete: `src/features/auth/index.ts`
- Delete: `src/features/feeds/components/index.ts`
- Delete: `src/features/feeds/index.ts`
- Delete: `src/features/reader/components/index.ts`
- Delete: `src/features/reader/index.ts`
- Delete: `src/features/settings/components/index.ts`
- Delete: `src/features/settings/index.ts`
- Delete: `src/features/settings/panels/index.ts`
- Delete: `src/features/settings/utils/index.ts`
- Delete: `src/features/toast/components/index.ts`
- Delete: `src/features/toast/index.ts`
- Delete: `src/utils/storage.ts`

- [ ] **Step 1: 再次确认文件无引用**

```bash
rg -n "components/ui/(scroll-area|separator|table)|features/.*/index|utils/storage" src
```

Expected: 仅命中文件自身定义或无结果，不出现真实业务导入。

- [ ] **Step 2: 删除确认无引用文件**

```bash
rm src/components/ui/scroll-area.tsx \
  src/components/ui/separator.tsx \
  src/components/ui/table.tsx \
  src/features/articles/components/index.ts \
  src/features/articles/index.ts \
  src/features/auth/components/index.ts \
  src/features/auth/index.ts \
  src/features/feeds/components/index.ts \
  src/features/feeds/index.ts \
  src/features/reader/components/index.ts \
  src/features/reader/index.ts \
  src/features/settings/components/index.ts \
  src/features/settings/index.ts \
  src/features/settings/panels/index.ts \
  src/features/settings/utils/index.ts \
  src/features/toast/components/index.ts \
  src/features/toast/index.ts \
  src/utils/storage.ts
```

- [ ] **Step 3: 运行一次静态检查验证导入未断裂**

Run: `pnpm lint`
Expected: PASS，无新增 missing import 错误。

### Task 2: 清理无用依赖并增强构建清理脚本

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `next.config.mjs`
- Create: `scripts/build/clean-build-artifacts.mjs`
- Modify: `.gitignore`

- [ ] **Step 1: 删除无用依赖与开发依赖**

```bash
pnpm remove @radix-ui/react-collapsible @radix-ui/react-scroll-area @radix-ui/react-separator rc-tree-select react-router-dom
pnpm remove -D @vitejs/plugin-react eslint-plugin-react-refresh vite
```

- [ ] **Step 2: 新增构建清理脚本并接入 npm scripts**

```js
// scripts/build/clean-build-artifacts.mjs
import { rmSync, existsSync } from 'node:fs';

const targets = ['.next', 'tsconfig.tsbuildinfo', 'tsconfig.typecheck.tsbuildinfo'];

for (const target of targets) {
  if (!existsSync(target)) continue;
  // 构建前清理旧产物，避免脏缓存影响体积与排障
  rmSync(target, { recursive: true, force: true });
}
```

```json
{
  "scripts": {
    "build:clean": "node scripts/build/clean-build-artifacts.mjs",
    "build": "pnpm build:clean && next build"
  }
}
```

- [ ] **Step 3: 为 Next 构建优化配置补充可维护注释**

```js
const nextConfig = {
  output: 'standalone',
  experimental: {
    // 对常用组件库按需重写导入路径，减少客户端打包体积
    optimizePackageImports: ['lucide-react'],
  },
};
```

- [ ] **Step 4: 补充忽略规则**

```gitignore
tsconfig.tsbuildinfo
tsconfig.typecheck.tsbuildinfo
```

### Task 3: 回归验证与产物优化确认

**Files:**
- Modify: `.superwork/plans/2026-05-13-build-output-optimization.md`

- [ ] **Step 1: 执行类型与风格基线验证**

Run:
- `pnpm lint`
- `pnpm type-check`

Expected: PASS。

- [ ] **Step 2: 执行生产构建验证**

Run: `pnpm build`
Expected: PASS，构建日志正常，路由生成无报错。

- [ ] **Step 3: 复跑未使用分析并记录净化结果**

Run: `pnpm dlx knip --no-progress`
Expected: 未使用项明显减少，仅剩可接受的“有意保留项”或无结果。

- [ ] **Step 4: Commit**

```bash
git add package.json pnpm-lock.yaml next.config.mjs .gitignore scripts/build/clean-build-artifacts.mjs src/components/ui src/features src/utils

git commit -m "chore(build): 精简无用资源并优化构建流程" -m $'- 删除无引用文件与依赖以收缩构建输入\n- 添加构建前清理脚本并接入 build 命令\n- 更新构建配置注释以提升可维护性'
```
