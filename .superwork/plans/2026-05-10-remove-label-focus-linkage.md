# Remove Label Focus Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 全项目移除通过 `label` 点击触发表单控件聚焦/切换的行为，仅保留真实控件点击触发。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/verification.md` — 验证基线与前端验证策略
- `.superwork/spec/frontend/index.md` — 前端范围、验证与交互约束
- `.superwork/spec/frontend/quality.md` — 交互修改时的测试与回归要求

**Architecture:** 本次改动只在前端 UI 层进行，不改业务状态流。统一把 `htmlFor`/`<label>` 的点击联动替换为 `aria-labelledby` 或保留已有 `aria-label`，保证无 label 点击聚焦，同时维持无障碍名称可用。

**Tech Stack:** React, TypeScript, Next.js, Vitest, Testing Library

---

### Task 1: 批量替换生产代码中的 label 点击联动

**Files:**

- Modify: `src/features/feeds/FeedDialogForm.tsx`
- Modify: `src/features/feeds/RenameCategoryDialog.tsx`
- Modify: `src/features/auth/LoginPage.tsx`
- Modify: `src/features/reader/GlobalSearchDialog.tsx`
- Modify: `src/features/settings/panels/AISettingsPanel.tsx`
- Modify: `src/features/settings/panels/RssSettingsPanel.tsx`
- Modify: `src/features/settings/panels/SecuritySettingsPanel.tsx`
- Modify: `src/features/feeds/FeedSummaryPolicyDialog.tsx`
- Modify: `src/features/feeds/FeedFulltextPolicyDialog.tsx`
- Modify: `src/features/feeds/FeedTranslationPolicyDialog.tsx`

- [ ] **Step 1: 先确认当前命中点（RED 前定位）**

Run: `rg -n "htmlFor=|<label\\b" src --glob "*.tsx" --glob "*.ts"`
Expected: 返回以上生产文件命中列表。

- [ ] **Step 2: 执行最小实现替换（GREEN）**

```tsx
// 统一模式：移除 htmlFor，改为 aria-labelledby 或保留 aria-label
const inputId = 'xxx';
const labelId = 'xxx-label';

<Label id={labelId}>字段名</Label>
<Input id={inputId} aria-labelledby={labelId} />

// 对 Switch 等已带 aria-label 的控件：移除 htmlFor，仅保留文本 Label
<Label>收到新文章时自动生成摘要</Label>
<Switch aria-label="收到新文章时自动生成摘要" />
```

- [ ] **Step 3: 再次扫描确保无遗漏**

Run: `rg -n "htmlFor=|<label\\b" src --glob "*.tsx" --glob "*.ts"`
Expected: 生产代码不再出现表单联动 `htmlFor` 或可点击 `<label>`（测试文件除外）。

### Task 2: 补充与运行回归验证

**Files:**

- Modify: `src/features/feeds/AddAiDigestDialog.test.tsx`（已覆盖 label 不聚焦/不勾选）
- Test: `src/features/feeds/AddAiDigestDialog.test.tsx`
- Test: `src/features/feeds/AddFeedDialog.test.tsx`
- Test: `src/features/feeds/FeedList.test.tsx`
- Test: `src/features/settings/SettingsCenterModal.test.tsx`
- Test: `src/features/auth/LoginPage.test.tsx`
- Test: `src/features/reader/GlobalSearchDialog.test.tsx`

- [ ] **Step 1: 运行受影响测试集**

Run: `pnpm vitest run src/features/feeds/AddAiDigestDialog.test.tsx src/features/feeds/AddFeedDialog.test.tsx src/features/feeds/FeedList.test.tsx src/features/settings/SettingsCenterModal.test.tsx src/features/auth/LoginPage.test.tsx src/features/reader/GlobalSearchDialog.test.tsx`
Expected: 全部通过。

- [ ] **Step 2: 运行静态检查**

Run: `pnpm lint && pnpm type-check`
Expected: 无错误退出。

- [ ] **Step 3: 完成 superwork-check 与 superwork-update-spec 决策**

Run: `python3 /Users/bryanhu/Develop/superwork/skills/superwork-check/scripts/check_specs.py --root . --format json`
Expected: 输出改动文件与验证提示；随后执行 `superwork-update-spec` 决策并记录 `update/create/no-update`。
