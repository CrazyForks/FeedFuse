# 订阅源自动化配置统一到规则中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 移除订阅源右键中的 AI 摘要/翻译/全文配置及其回退逻辑，统一只走规则中心，并保证新项目默认存在“打开时标记已读”规则，老项目保持迁移逻辑。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — 仓库结构与目录职责
- `.superwork/spec/guides/verification.md` — 任务验证基线
- `.superwork/spec/guides/change-boundaries.md` — 前后端/worker 分层边界
- `.superwork/spec/frontend/contracts.md` — 规则中心与前端交互契约
- `.superwork/spec/backend/contracts.md` — 自动化规则后端执行与迁移契约

**Architecture:** 前端删除 Feed 右键里的三类旧配置入口，保留“规则中心”作为唯一自动化配置入口。后端在 on-open/on-fetch 链路移除订阅源开关回退，仅使用规则引擎命中动作；同时在迁移服务补充“规则为空时注入默认打开标记已读规则”，并保留 legacy 迁移幂等标记逻辑，兼容老项目。

**Tech Stack:** Next.js, TypeScript, Zustand, Vitest, pg/SQL

---

### Task 1: 移除订阅源右键旧自动化配置入口（前端）

**Files:**
- Modify: `src/features/feeds/components/FeedList.tsx`
- Test: `src/test/features/feeds/FeedList.test.tsx`

- [ ] **Step 1: 写失败测试，断言右键菜单不再出现旧配置项**

```ts
it('does not show legacy feed automation policy entries in context menu', async () => {
  renderWithNotifications();

  fireEvent.contextMenu(screen.getByRole('button', { name: /My Feed.*2/ }));

  expect(screen.queryByRole('menuitem', { name: '全文抓取配置' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'AI摘要配置' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: '翻译配置' })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 运行单测确认失败**

Run: `pnpm test:run -- src/test/features/feeds/FeedList.test.tsx`
Expected: FAIL（现有实现仍渲染旧菜单项）

- [ ] **Step 3: 实现删除菜单项与相关状态/弹窗引用**

```ts
// 删除 dynamic import: FeedFulltextPolicyDialog / FeedSummaryPolicyDialog / FeedTranslationPolicyDialog
// 删除 state: fulltextPolicyFeedId / summaryPolicyFeedId / translationPolicyFeedId
// 删除 active*PolicyFeed memo
// 删除右键菜单里的 3 个 ContextMenuItem
// 删除页面底部 3 个 Dialog 渲染块
```

- [ ] **Step 4: 运行同一测试确认通过**

Run: `pnpm test:run -- src/test/features/feeds/FeedList.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交本任务（如需分提交）**

```bash
git add src/features/feeds/components/FeedList.tsx src/test/features/feeds/FeedList.test.tsx
git commit -m "refactor(feeds): 移除订阅源右键旧自动化配置入口" -m $'- 移除全文摘要翻译的右键配置菜单与弹窗状态\n- 更新列表交互测试以约束规则中心唯一入口'
```

### Task 2: 清理旧配置弹窗与其专属测试（前端）

**Files:**
- Delete: `src/features/feeds/components/FeedFulltextPolicyDialog.tsx`
- Delete: `src/features/feeds/components/FeedSummaryPolicyDialog.tsx`
- Delete: `src/features/feeds/components/FeedTranslationPolicyDialog.tsx`
- Delete: `src/test/features/feeds/FeedPolicyDialogs.test.tsx`

- [ ] **Step 1: 删除已不再可达的旧组件与测试文件**

```bash
rm src/features/feeds/components/FeedFulltextPolicyDialog.tsx \
  src/features/feeds/components/FeedSummaryPolicyDialog.tsx \
  src/features/feeds/components/FeedTranslationPolicyDialog.tsx \
  src/test/features/feeds/FeedPolicyDialogs.test.tsx
```

- [ ] **Step 2: 运行前端相关测试确认无引用残留**

Run: `pnpm test:run -- src/test/features/feeds/FeedList.test.tsx`
Expected: PASS（无模块找不到错误）

- [ ] **Step 3: 提交本任务（如需分提交）**

```bash
git add src/features/feeds/components/FeedFulltextPolicyDialog.tsx \
  src/features/feeds/components/FeedSummaryPolicyDialog.tsx \
  src/features/feeds/components/FeedTranslationPolicyDialog.tsx \
  src/test/features/feeds/FeedPolicyDialogs.test.tsx
git commit -m "refactor(feeds): 清理订阅源旧自动化配置弹窗" -m $'- 删除已下线的全文摘要翻译配置组件\n- 移除对应前端互斥开关测试'
```

### Task 3: 后端去除订阅源开关回退，只执行规则引擎结果

**Files:**
- Modify: `src/app/api/articles/[id]/automation/on-open/route.ts`
- Modify: `src/worker/articleFilterWorker.ts`
- Test: `src/test/app/api/articles/[id]/automation/on-open/route.test.ts`
- Test: `src/test/worker/articleFilterWorker.test.ts`

- [ ] **Step 1: 写失败测试，约束 on-open 无规则时不再回退 feed 开关**

```ts
it('returns empty triggeredActions when no rule action matched', async () => {
  // evaluateAutomationRules => { actions: {} }
  // feed 含旧开关 true
  // 断言 triggeredActions === []
});
```

- [ ] **Step 2: 写失败测试，约束 on-fetch 无规则时不再触发旧自动 AI 入库开关**

```ts
it('does not enqueue legacy auto ai triggers when no rule action matched', async () => {
  // ruleRows 空 + decision.actions 空
  // 断言 enqueueAutoAiTriggersOnFetch 未被调用
});
```

- [ ] **Step 3: 运行两组测试确认失败**

Run: `pnpm test:run -- src/test/app/api/articles/[id]/automation/on-open/route.test.ts src/test/worker/articleFilterWorker.test.ts`
Expected: FAIL（当前仍存在 fallback）

- [ ] **Step 4: 实现移除 fallback 逻辑，并加关键中文注释说明原因**

```ts
// on-open route: 删除“无命中规则时回退旧开关”分支
// articleFilterWorker: 删除 handledByRules/enqueueAutoAiTriggersOnFetch fallback 分支
// 注释说明：自动化统一由规则中心驱动，避免双轨配置分歧
```

- [ ] **Step 5: 重新运行上述测试确认通过**

Run: `pnpm test:run -- src/test/app/api/articles/[id]/automation/on-open/route.test.ts src/test/worker/articleFilterWorker.test.ts`
Expected: PASS

### Task 4: 新项目默认注入“打开时标记已读”规则，保留老项目迁移

**Files:**
- Modify: `src/server/domains/automation-rules/services/ruleMigrationService.ts`
- Modify: `src/test/server/services/ruleMigrationService.test.ts`
- Modify: `src/test/app/api/settings/routes.test.ts`

- [ ] **Step 1: 写失败测试，覆盖“无 legacy 数据时也应创建默认规则”**

```ts
it('creates default on-open mark-read rule for fresh projects', async () => {
  // uiSettings 使用 defaultPersistedSettings
  // feeds = []
  // alreadyMigrated = false
  // 断言 createAutomationRule 被调用一次且 actionType=mark_read
});
```

- [ ] **Step 2: 写失败测试，覆盖设置保存阶段会触发默认规则注入调用**

```ts
expect(migrateLegacyAutomationSettingsMock).toHaveBeenCalledWith(
  expect.objectContaining({
    alreadyMigrated: false,
  }),
);
```

- [ ] **Step 3: 运行后端测试确认失败**

Run: `pnpm test:run -- src/test/server/services/ruleMigrationService.test.ts src/test/app/api/settings/routes.test.ts`
Expected: FAIL（当前 fresh project 无默认规则）

- [ ] **Step 4: 实现规则注入逻辑并保持迁移幂等标记**

```ts
// ruleMigrationService:
// 1) 提取 createDefaultOpenMarkReadRule(delayMs)
// 2) buildRulesFromLegacyInput 在无 legacy 命中时也追加该默认规则
// 3) 已有 legacy 规则时保持原迁移逻辑
// 4) 仍通过 automationRulesMigrated 防止重复迁移
// 关键注释：新项目默认规则与老项目迁移统一复用同一入口
```

- [ ] **Step 5: 运行上述测试确认通过**

Run: `pnpm test:run -- src/test/server/services/ruleMigrationService.test.ts src/test/app/api/settings/routes.test.ts`
Expected: PASS

### Task 5: 全量回归与收尾

**Files:**
- Verify: `src/test/features/feeds/FeedList.test.tsx`
- Verify: `src/test/app/api/articles/[id]/automation/on-open/route.test.ts`
- Verify: `src/test/worker/articleFilterWorker.test.ts`
- Verify: `src/test/server/services/ruleMigrationService.test.ts`
- Verify: `src/test/app/api/settings/routes.test.ts`

- [ ] **Step 1: 运行针对性测试集**

Run: `pnpm test:run -- src/test/features/feeds/FeedList.test.tsx src/test/app/api/articles/[id]/automation/on-open/route.test.ts src/test/worker/articleFilterWorker.test.ts src/test/server/services/ruleMigrationService.test.ts src/test/app/api/settings/routes.test.ts`
Expected: PASS

- [ ] **Step 2: 运行质量基线**

Run: `pnpm lint && pnpm type-check`
Expected: PASS

- [ ] **Step 3: 生成最终提交（如用户要求）**

```bash
git add src/features/feeds/components/FeedList.tsx \
  src/app/api/articles/[id]/automation/on-open/route.ts \
  src/worker/articleFilterWorker.ts \
  src/server/domains/automation-rules/services/ruleMigrationService.ts \
  src/test/features/feeds/FeedList.test.tsx \
  src/test/app/api/articles/[id]/automation/on-open/route.test.ts \
  src/test/worker/articleFilterWorker.test.ts \
  src/test/server/services/ruleMigrationService.test.ts \
  src/test/app/api/settings/routes.test.ts
git commit -m "refactor(automation-rules): 统一自动化为规则中心配置" -m $'- 移除订阅源右键旧自动化配置入口与回退执行链路\n- 新增项目默认打开标记已读规则并保留历史迁移幂等\n- 更新前后端与 worker 测试覆盖统一规则行为'
```
