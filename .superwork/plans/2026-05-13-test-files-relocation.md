# Test Files Relocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把当前 `src` 下与业务文件混放的测试文件全部迁移到 `src/test`，并保持与业务代码一致的目录结构且测试可运行。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — 仓库目录职责与测试相关命令
- `.superwork/spec/guides/verification.md` — 测试分布与验证基线
- `.superwork/spec/guides/change-boundaries.md` — 跨层改动边界
- `.superwork/spec/backend/index.md` — 后端测试与验证清单
- `.superwork/spec/frontend/index.md` — 前端测试与验证清单
- `.superwork/spec/shared/index.md` — 共享层测试与验证清单

**Architecture:** 通过一次性迁移脚本扫描 `src/**/*.{test,spec}.{ts,tsx}`，将测试文件移动到 `src/test/**` 的镜像路径。脚本在移动前按“原文件位置 -> 新文件位置”映射重写测试文件里的相对模块路径（`import` / `export ... from` / dynamic `import()` / `require()` / `vi.mock()` 等），避免手工逐文件修改。随后同步 `vitest.config.ts` 的 include 规则到 `src/test/**` 并执行回归验证。

**Tech Stack:** Node.js ESM 脚本、TypeScript/Vitest、pnpm

---

### Task 1: 建立迁移基线与目标映射

**Files:**
- Modify: `package.json`
- Create: `scripts/testing/relocate-tests.mjs`

- [ ] **Step 1: 写迁移脚本前先收集目标文件清单（失败前置）**

```bash
rg --files -g '*.{test,spec}.{ts,tsx}' src > /tmp/feedfuse-tests-before.txt
wc -l /tmp/feedfuse-tests-before.txt
```

Expected: 输出测试文件总数（后续迁移后用于一致性比对）。

- [ ] **Step 2: 添加可重复执行的迁移命令入口**

```json
{
  "scripts": {
    "test:relocate": "node scripts/testing/relocate-tests.mjs"
  }
}
```

- [ ] **Step 3: 编写迁移脚本骨架（扫描 + 映射 + dry-run 输出）**

```js
// scripts/testing/relocate-tests.mjs
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const TEST_ROOT = path.join(SRC_DIR, 'test');

function isTestFile(filePath) {
  return /\.(test|spec)\.(ts|tsx)$/.test(filePath);
}

function getMirrorTarget(absPath) {
  const rel = path.relative(SRC_DIR, absPath);
  return path.join(TEST_ROOT, rel);
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json scripts/testing/relocate-tests.mjs
git commit -m "chore(test): 添加测试迁移脚本入口" -m $'- 添加测试迁移命令以统一执行入口\n- 添加迁移脚本骨架用于扫描与映射'
```

### Task 2: 实现路径重写与批量迁移

**Files:**
- Modify: `scripts/testing/relocate-tests.mjs`

- [ ] **Step 1: 为相对模块路径实现重写函数**

```js
function rewriteRelativeSpecifier(oldFile, newFile, specifier) {
  if (!specifier.startsWith('.')) return specifier;
  const oldResolved = path.resolve(path.dirname(oldFile), specifier);
  let next = path.relative(path.dirname(newFile), oldResolved).replaceAll('\\\\', '/');
  if (!next.startsWith('.')) next = `./${next}`;
  return next;
}
```

- [ ] **Step 2: 覆盖常见导入语法并重写字符串字面量**

```js
const PATTERNS = [
  /(from\s*['"])(\.\.?[^'"]*)(['"])/g,
  /(import\s*\(\s*['"])(\.\.?[^'"]*)(['"]\s*\))/g,
  /(require\s*\(\s*['"])(\.\.?[^'"]*)(['"]\s*\))/g,
  /(vi\.(?:mock|doMock|unmock)\s*\(\s*['"])(\.\.?[^'"]*)(['"])/g,
];
```

- [ ] **Step 3: 实现迁移主流程（创建目录、写新文件、删除旧文件）**

```js
for (const srcTestFile of testFiles) {
  const target = getMirrorTarget(srcTestFile);
  const raw = await fs.readFile(srcTestFile, 'utf8');
  const rewritten = rewriteAllSpecifiers(raw, srcTestFile, target);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, rewritten, 'utf8');
  await fs.unlink(srcTestFile);
}
```

- [ ] **Step 4: 跳过 `src/test/**` 以保证幂等**

```js
if (absPath.startsWith(TEST_ROOT + path.sep)) {
  return;
}
```

- [ ] **Step 5: Run test to verify migration command works**

Run: `pnpm test:relocate`
Expected: 输出迁移文件数量，且无异常退出。

- [ ] **Step 6: Commit**

```bash
git add scripts/testing/relocate-tests.mjs
git commit -m "feat(test): 实现测试文件批量迁移与路径重写" -m $'- 添加相对导入重写以保持迁移后可解析\n- 添加批量移动与幂等保护逻辑'
```

### Task 3: 同步 Vitest 发现规则到新目录

**Files:**
- Modify: `vitest.config.ts`

- [ ] **Step 1: 更新 node/jsdom 的 include 规则到 `src/test/**`**

```ts
const nodeTestGlobs = [
  'src/test/server/**/*.test.ts',
  'src/test/worker/**/*.test.ts',
  'src/test/app/api/**/*.test.ts',
  'src/test/lib/**/*.test.ts',
  'src/test/utils/**/*.test.ts',
  'src/test/data/**/*.test.ts',
];

include: ['src/test/**/*.{test,spec}.{ts,tsx}']
```

- [ ] **Step 2: 保持 setup 与 alias 不变，避免引入额外行为变化**

```ts
setupFiles: ['./src/test/setup.ts']
```

- [ ] **Step 3: Commit**

```bash
git add vitest.config.ts
git commit -m "test(vitest): 更新测试发现路径到 src/test" -m $'- 更新 node 与 jsdom 的 include 规则\n- 保持测试初始化与别名配置不变'
```

### Task 4: 执行验证并处理残留路径

**Files:**
- Modify: `src/test/**` (仅在验证发现问题时最小修复)

- [ ] **Step 1: 检查是否仍有混放测试文件残留**

Run: `rg --files -g '*.{test,spec}.{ts,tsx}' src | rg -v '^src/test/'`
Expected: 无输出。

- [ ] **Step 2: 运行测试与静态检查**

Run: `pnpm test:unit`
Expected: PASS（若有失败，定位到迁移导致的路径问题并修复）。

Run: `pnpm lint`
Expected: PASS。

Run: `pnpm type-check`
Expected: PASS。

- [ ] **Step 3: Commit**

```bash
git add src/test
# 若有修复并包含配置改动，同时加入对应文件
git commit -m "fix(test): 修复迁移后残留路径与验证问题" -m $'- 修复迁移后失败用例的路径解析问题\n- 更新受影响测试以通过 lint 与类型检查'
```

### Task 5: 收尾与交付说明

**Files:**
- Modify: `.superwork/plans/2026-05-13-test-files-relocation.md` (勾选完成项)

- [ ] **Step 1: 输出迁移结果摘要（数量与目录）**

```bash
rg --files -g '*.{test,spec}.{ts,tsx}' src/test | wc -l
```

- [ ] **Step 2: 最终提交（若前面采用单次提交策略则聚合提交）**

```bash
git add -A
git commit -m "refactor(test): 迁移测试到独立目录并保持同构结构" -m $'- 迁移测试文件到 src/test 镜像目录\n- 重写相对导入并更新 Vitest 发现规则\n- 验证测试与静态检查通过'
```
