# 自动化规则中心 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增统一规则中心并替代分散自动化开关，让入库与打开链路都通过同一 RuleEngine 决策自动化动作。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/repo-map.md` — 目录职责与代码落点
- `.superwork/spec/guides/change-boundaries.md` — route/service/repository 与前端边界
- `.superwork/spec/guides/verification.md` — 验证命令与回归策略
- `.superwork/spec/frontend/contracts.md` — 设置中心与 API 客户端契约
- `.superwork/spec/frontend/quality.md` — 设置中心交互测试要求
- `.superwork/spec/backend/contracts.md` — 后端分层契约
- `.superwork/spec/backend/quality.md` — 仓储/接口/worker 测试要求

**Architecture:** 新增 `automation-rules` 领域（repository + validation + engine），提供规则 CRUD 与排序 API，并在 `articleFilterWorker` 与文章打开事件统一调用 RuleEngine。前端在设置中心新增“规则中心”Tab 编辑规则，旧自动化开关迁移后降级为只读提示。规则冲突按 `priority` 升序、同动作首条命中生效。

**Tech Stack:** TypeScript, Next.js Route Handlers, PostgreSQL, Zod, Zustand, Vitest, React Testing Library

---

## 文件结构规划

- Create: `src/server/infra/db/migrations/0029_automation_rules.sql`
- Create: `src/server/domains/automation-rules/repositories/automationRulesRepo.ts`
- Create: `src/server/domains/automation-rules/services/ruleValidationService.ts`
- Create: `src/server/domains/automation-rules/services/ruleEngineService.ts`
- Create: `src/server/domains/automation-rules/services/ruleMigrationService.ts`
- Create: `src/app/api/automation-rules/route.ts`
- Create: `src/app/api/automation-rules/[id]/route.ts`
- Create: `src/app/api/automation-rules/reorder/route.ts`
- Create: `src/app/api/articles/[id]/automation/on-open/route.ts`
- Create: `src/features/automation-rules/components/RulesCenterPanel.tsx`
- Create: `src/features/automation-rules/components/RuleEditorDialog.tsx`
- Create: `src/features/automation-rules/utils/ruleFormSchema.ts`
- Create: `src/test/server/repositories/automationRulesRepo.test.ts`
- Create: `src/test/server/services/ruleEngineService.test.ts`
- Create: `src/test/server/services/ruleMigrationService.test.ts`
- Create: `src/test/app/api/automation-rules/routes.test.ts`
- Create: `src/test/app/api/articles/[id]/automation/on-open/route.test.ts`
- Create: `src/test/features/automation-rules/RulesCenterPanel.test.tsx`
- Create: `src/test/features/articles/ArticleView.onOpenAutomation.test.tsx`
- Modify: `src/worker/articleFilterWorker.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/features/settings/components/SettingsCenterDrawer.tsx`
- Modify: `src/features/settings/panels/GeneralSettingsPanel.tsx`
- Modify: `src/features/settings/panels/RssSettingsPanel.tsx`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/types/index.ts`

### Task 1: 建立规则数据表与仓储测试基线

**Files:**
- Create: `src/server/infra/db/migrations/0029_automation_rules.sql`
- Create: `src/test/server/repositories/automationRulesRepo.test.ts`

- [ ] **Step 1: 写失败测试，约束 SQL 字段与索引存在**
```ts
import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';

describe('automationRulesRepo sql contract', () => {
  it('list/create/update/reorder contain required columns', async () => {
    const mod = await import('@/server/domains/automation-rules/repositories/automationRulesRepo');
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const pool = { query } as unknown as Pool;

    await mod.listAutomationRules(pool);
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('trigger_phase');
    expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('conditions');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/server/repositories/automationRulesRepo.test.ts`
Expected: FAIL，提示 `Cannot find module '@/server/domains/automation-rules/repositories/automationRulesRepo'`

- [ ] **Step 3: 写 migration 文件**
```sql
create table if not exists automation_rules (
  id bigserial primary key,
  name text not null,
  enabled boolean not null default true,
  priority integer not null,
  scope_type text not null check (scope_type in ('global','category','feed')),
  scope_ref_id bigint null,
  trigger_phase text not null check (trigger_phase in ('on_fetch','on_open')),
  conditions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists automation_rule_actions (
  id bigserial primary key,
  rule_id bigint not null references automation_rules(id) on delete cascade,
  action_type text not null check (action_type in ('mark_read','filter','ai_summary','ai_translate','fulltext_fetch')),
  action_config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(rule_id, action_type)
);

create index if not exists idx_automation_rules_phase_enabled_priority
  on automation_rules(trigger_phase, enabled, priority);

create index if not exists idx_automation_rules_scope
  on automation_rules(scope_type, scope_ref_id);
```

- [ ] **Step 4: 再跑测试（仍失败，进入下一任务实现仓储）**
Run: `pnpm test:unit -- --run src/test/server/repositories/automationRulesRepo.test.ts`
Expected: FAIL，仍缺仓储实现，但测试能执行到断言阶段

- [ ] **Step 5: 提交当前变更**
```bash
git add src/server/infra/db/migrations/0029_automation_rules.sql src/test/server/repositories/automationRulesRepo.test.ts
git commit -m "test(automation-rules): 添加规则仓储契约测试基线" -m $'- 添加规则仓储 SQL 字段契约测试\n- 添加自动化规则表迁移脚本'
```

### Task 2: 实现规则仓储 CRUD 与排序

**Files:**
- Create: `src/server/domains/automation-rules/repositories/automationRulesRepo.ts`
- Modify: `src/test/server/repositories/automationRulesRepo.test.ts`

- [ ] **Step 1: 扩展失败测试覆盖 create/update/reorder**
```ts
it('creates rule with actions and updates priority order', async () => {
  const mod = await import('@/server/domains/automation-rules/repositories/automationRulesRepo');
  const query = vi
    .fn()
    .mockResolvedValueOnce({ rows: [{ id: '1' }] })
    .mockResolvedValue({ rows: [] });

  const pool = { query } as unknown as Pool;
  await mod.createAutomationRule(pool, {
    name: '工作时段入库过滤',
    enabled: true,
    priority: 100,
    scopeType: 'global',
    scopeRefId: null,
    triggerPhase: 'on_fetch',
    conditions: { keyword: { enabled: true, mode: 'any', values: ['广告'] } },
    actions: [{ actionType: 'filter', actionConfig: { reason: 'keyword' } }],
  });

  expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('insert into automation_rules');
  expect(String(query.mock.calls[1]?.[0] ?? '')).toContain('insert into automation_rule_actions');
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/server/repositories/automationRulesRepo.test.ts`
Expected: FAIL，提示缺少 `createAutomationRule`

- [ ] **Step 3: 实现仓储核心接口**
```ts
export async function listAutomationRules(db: DbClient): Promise<AutomationRuleRow[]> {
  const { rows } = await db.query<AutomationRuleRow>(`
    select
      r.id,
      r.name,
      r.enabled,
      r.priority,
      r.scope_type as "scopeType",
      r.scope_ref_id as "scopeRefId",
      r.trigger_phase as "triggerPhase",
      r.conditions,
      coalesce(
        json_agg(
          json_build_object(
            'id', a.id,
            'actionType', a.action_type,
            'actionConfig', a.action_config
          )
          order by a.id asc
        ) filter (where a.id is not null),
        '[]'::json
      ) as actions
    from automation_rules r
    left join automation_rule_actions a on a.rule_id = r.id
    group by r.id
    order by r.priority asc, r.id asc
  `);
  return rows;
}

export async function createAutomationRule(db: DbClient, input: CreateAutomationRuleInput): Promise<string> {
  const inserted = await db.query<{ id: string }>(
    `
      insert into automation_rules(
        name,
        enabled,
        priority,
        scope_type,
        scope_ref_id,
        trigger_phase,
        conditions
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb)
      returning id
    `,
    [
      input.name,
      input.enabled,
      input.priority,
      input.scopeType,
      input.scopeRefId,
      input.triggerPhase,
      JSON.stringify(input.conditions),
    ],
  );
  const ruleId = inserted.rows[0]?.id;
  for (const action of input.actions) {
    await db.query(`insert into automation_rule_actions (rule_id, action_type, action_config) values ($1,$2,$3::jsonb)`, [ruleId, action.actionType, JSON.stringify(action.actionConfig)]);
  }
  return ruleId;
}

export async function reorderAutomationRules(db: DbClient, input: Array<{ id: string; priority: number }>): Promise<void> {
  for (const item of input) {
    await db.query(`update automation_rules set priority = $1, updated_at = now() where id = $2`, [item.priority, item.id]);
  }
}
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/server/repositories/automationRulesRepo.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/server/domains/automation-rules/repositories/automationRulesRepo.ts src/test/server/repositories/automationRulesRepo.test.ts
git commit -m "feat(automation-rules): 实现规则仓储读写与排序" -m $'- 添加规则与动作表仓储接口\n- 支持规则优先级批量更新'
```

### Task 3: 实现规则校验与 RuleEngine 决议

**Files:**
- Create: `src/server/domains/automation-rules/services/ruleValidationService.ts`
- Create: `src/server/domains/automation-rules/services/ruleEngineService.ts`
- Create: `src/test/server/services/ruleEngineService.test.ts`

- [ ] **Step 1: 写失败测试覆盖优先级与条件匹配**
```ts
import { describe, expect, it } from 'vitest';

describe('ruleEngineService', () => {
  it('uses first matched rule per action type by priority asc', async () => {
    const { evaluateAutomationRules } = await import('@/server/domains/automation-rules/services/ruleEngineService');
    const result = evaluateAutomationRules({
      phase: 'on_fetch',
      now: '2026-05-14T10:00:00+08:00',
      article: { title: '广告合作', summary: '推广', sourceLanguage: 'en' },
      feedId: '10',
      categoryId: '20',
      rules: [
        { id: '2', priority: 200, actionType: 'filter', conditions: { keyword: { enabled: true, mode: 'any', values: ['广告'] } } },
        { id: '1', priority: 100, actionType: 'filter', conditions: { keyword: { enabled: true, mode: 'any', values: ['广告'] } } },
      ],
    });

    expect(result.actions.filter?.ruleId).toBe('1');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/server/services/ruleEngineService.test.ts`
Expected: FAIL，提示 `evaluateAutomationRules` 未实现

- [ ] **Step 3: 实现校验与求值逻辑**
```ts
export function normalizeRuleInput(input: unknown): NormalizedAutomationRuleInput {
  const parsed = automationRuleInputSchema.parse(input);
  return {
    ...parsed,
    conditions: {
      keyword: parsed.conditions.keyword ?? { enabled: false, mode: 'any', values: [] },
      sourceLanguage: parsed.conditions.sourceLanguage ?? { enabled: false, values: [] },
      timeWindow: parsed.conditions.timeWindow ?? { enabled: false, timezone: 'Asia/Shanghai', daysOfWeek: [], start: '00:00', end: '23:59' },
    },
  };
}

export function evaluateAutomationRules(input: EvaluateAutomationRulesInput): EvaluateAutomationRulesResult {
  const sorted = [...input.rules].sort((a, b) => a.priority - b.priority);
  const actions: Record<string, { ruleId: string; actionConfig: Record<string, unknown> } | undefined> = {};

  for (const rule of sorted) {
    if (!matchesScope(rule, input)) continue;
    if (!matchesConditions(rule.conditions, input)) continue;
    if (!actions[rule.actionType]) {
      actions[rule.actionType] = { ruleId: rule.id, actionConfig: rule.actionConfig };
    }
  }

  return { actions };
}
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/server/services/ruleEngineService.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/server/domains/automation-rules/services/ruleValidationService.ts src/server/domains/automation-rules/services/ruleEngineService.ts src/test/server/services/ruleEngineService.test.ts
git commit -m "feat(automation-rules): 添加规则校验与决议引擎" -m $'- 添加规则条件归一化与校验\n- 添加按优先级的动作决议逻辑'
```

### Task 4: 实现规则 API（CRUD + reorder）

**Files:**
- Create: `src/app/api/automation-rules/route.ts`
- Create: `src/app/api/automation-rules/[id]/route.ts`
- Create: `src/app/api/automation-rules/reorder/route.ts`
- Create: `src/test/app/api/automation-rules/routes.test.ts`
- Modify: `src/lib/api/apiClient.ts`

- [ ] **Step 1: 写失败测试覆盖 GET/POST/PATCH/DELETE/reorder**
```ts
it('POST /api/automation-rules validates body and creates rule', async () => {
  const mod = await import('../../../../app/api/automation-rules/route');
  const res = await mod.POST(new Request('http://localhost/api/automation-rules', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '', triggerPhase: 'on_fetch' }),
  }));
  const json = await res.json();
  expect(json.ok).toBe(false);
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/app/api/automation-rules/routes.test.ts`
Expected: FAIL，提示找不到新 route 模块

- [ ] **Step 3: 实现 route 与 apiClient**
```ts
export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;
  const rows = await listAutomationRules(getPool());
  return ok(rows);
}

export async function POST(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) return authResponse;
  const json = await request.json().catch(() => null);
  const input = normalizeRuleInput(json);
  const id = await createAutomationRule(getPool(), input);
  return ok({ id });
}

export async function reorderAutomationRulesRequest(input: Array<{ id: string; priority: number }>) {
  return requestApi('/api/automation-rules/reorder', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ items: input }),
  });
}
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/app/api/automation-rules/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/app/api/automation-rules src/lib/api/apiClient.ts src/test/app/api/automation-rules/routes.test.ts
git commit -m "feat(api): 添加自动化规则管理接口" -m $'- 添加规则增删改查与重排接口\n- 更新前端 API 客户端封装'
```

### Task 5: 入库链路接入 RuleEngine（替代分散过滤/触发判断）

**Files:**
- Modify: `src/worker/articleFilterWorker.ts`
- Modify: `src/worker/index.ts`
- Create: `src/test/worker/articleFilterWorker.rules.test.ts`

- [ ] **Step 1: 写失败测试，验证 worker 使用 RuleEngine 决议动作**
```ts
it('on_fetch uses rule engine result to apply filter and enqueue ai jobs', async () => {
  const { runArticleFilterWorker } = await import('../../worker/articleFilterWorker');
  const evaluateRules = vi.fn().mockReturnValue({
    actions: {
      filter: { ruleId: '1', actionConfig: { reason: 'keyword' } },
      ai_summary: { ruleId: '2', actionConfig: {} },
    },
  });

  await runArticleFilterWorker({
    boss: { send: vi.fn() } as never,
    job: { articleId: 'a1', articleFilter: { keyword: { enabled: false, keywords: [] }, ai: { enabled: false, prompt: '' } }, feed: { id: 'f1', aiSummaryOnFetchEnabled: false, bodyTranslateOnFetchEnabled: false } },
  }, {
    evaluateRules,
    getArticleForFilter: vi.fn().mockResolvedValue({
      id: 'a1',
      title: '广告合作',
      summary: '推广',
      sourceLanguage: 'en',
    }),
    applyFilterResult: vi.fn().mockResolvedValue(undefined),
    enqueueAutoAiSummary: vi.fn().mockResolvedValue(undefined),
    enqueueAutoAiTranslate: vi.fn().mockResolvedValue(undefined),
  } as never);

  expect(evaluateRules).toHaveBeenCalled();
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/worker/articleFilterWorker.rules.test.ts`
Expected: FAIL，`evaluateRules` 未接入

- [ ] **Step 3: 接入 RuleEngine 并分发动作**
```ts
const decision = deps.evaluateRules({
  phase: 'on_fetch',
  now: new Date().toISOString(),
  article: { title: article.title, summary: article.summary, sourceLanguage: article.sourceLanguage },
  feedId: feed.id,
  categoryId: feed.categoryId ?? null,
  rules,
});

if (decision.actions.filter) {
  await deps.applyFilterResult({ articleId: article.id, filteredBy: ['rule'] });
}

if (decision.actions.ai_summary) {
  await deps.enqueueAutoAiSummary(input.boss, article.id);
}
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/worker/articleFilterWorker.rules.test.ts src/test/worker/articleFilterWorker.test.ts`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/worker/articleFilterWorker.ts src/worker/index.ts src/test/worker/articleFilterWorker.rules.test.ts
git commit -m "refactor(worker): 统一入库自动化决议入口" -m $'- 接入规则引擎替代分散开关判断\n- 保持现有入库任务链路兼容'
```

### Task 6: 打开链路接入规则触发

**Files:**
- Create: `src/app/api/articles/[id]/automation/on-open/route.ts`
- Create: `src/test/app/api/articles/[id]/automation/on-open/route.test.ts`
- Create: `src/test/features/articles/ArticleView.onOpenAutomation.test.tsx`
- Modify: `src/features/articles/components/ArticleView.tsx`
- Modify: `src/lib/api/apiClient.ts`

- [ ] **Step 1: 写失败测试，验证 on-open 接口能返回动作执行结果**
```ts
it('POST /api/articles/[id]/automation/on-open triggers actions by rules', async () => {
  const mod = await import('../../../../../../app/api/articles/[id]/automation/on-open/route');
  const res = await mod.POST(new Request('http://localhost/api/articles/1/automation/on-open', { method: 'POST' }), {
    params: Promise.resolve({ id: '1' }),
  });
  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(json.data).toHaveProperty('triggeredActions');
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/app/api/articles/[id]/automation/on-open/route.test.ts`
Expected: FAIL，缺少 route

- [ ] **Step 3: 实现 route + 前端调用替换**
```ts
export async function triggerArticleOpenAutomation(articleId: string) {
  return requestApi(`/api/articles/${articleId}/automation/on-open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
  });
}
```

```ts
useEffect(() => {
  const articleId = article?.id;
  if (!articleId) return;
  void triggerArticleOpenAutomation(articleId).catch((err) => {
    console.error(err);
  });
}, [article?.id]);
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/app/api/articles/[id]/automation/on-open/route.test.ts src/test/features/articles/ArticleView.onOpenAutomation.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/app/api/articles/[id]/automation/on-open/route.ts src/lib/api/apiClient.ts src/features/articles/components/ArticleView.tsx src/test/app/api/articles/[id]/automation/on-open/route.test.ts src/test/features/articles/ArticleView.onOpenAutomation.test.tsx
git commit -m "feat(articles): 添加打开文章自动化触发入口" -m $'- 新增文章打开事件自动化接口\n- 在文章视图接入统一触发调用'
```

### Task 7: 设置中心新增规则中心并收口旧开关

**Files:**
- Create: `src/features/automation-rules/components/RulesCenterPanel.tsx`
- Create: `src/features/automation-rules/components/RuleEditorDialog.tsx`
- Create: `src/features/automation-rules/utils/ruleFormSchema.ts`
- Create: `src/test/features/automation-rules/RulesCenterPanel.test.tsx`
- Modify: `src/features/settings/components/SettingsCenterDrawer.tsx`
- Modify: `src/features/settings/panels/GeneralSettingsPanel.tsx`
- Modify: `src/features/settings/panels/RssSettingsPanel.tsx`

- [ ] **Step 1: 写失败测试，验证 SettingsCenter 出现 rules Tab 与规则列表**
```ts
it('shows rules tab and renders RulesCenterPanel', async () => {
  renderWithNotifications();
  fireEvent.click(screen.getByTestId('settings-open-button'));
  expect(await screen.findByTestId('settings-section-tab-rules')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('settings-section-tab-rules'));
  expect(await screen.findByText('规则中心')).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/automation-rules/RulesCenterPanel.test.tsx`
Expected: FAIL，`settings-section-tab-rules` 不存在

- [ ] **Step 3: 实现 RulesCenterPanel 与设置页接入**
```tsx
const sectionItems: SettingsSectionItem[] = [
  { key: 'general', label: '通用', icon: Palette },
  { key: 'rss', label: 'RSS', icon: Rss },
  { key: 'ai', label: 'AI', icon: Bot },
  { key: 'rules', label: '规则中心', icon: SlidersHorizontal },
  { key: 'security', label: '账号与安全', icon: KeyRound },
  { key: 'logging', label: '日志', icon: ScrollText },
];
```

```tsx
<TabsContent value="rules" className="mt-0 h-full overflow-y-auto">
  <RulesCenterPanel />
</TabsContent>
```

```tsx
<p className="text-xs text-muted-foreground">
  自动化行为已迁移到规则中心，这里仅保留阅读偏好。
</p>
```

- [ ] **Step 4: 跑测试确认通过**
Run: `pnpm test:unit -- --run src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/automation-rules/RulesCenterPanel.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交**
```bash
git add src/features/automation-rules src/features/settings/components/SettingsCenterDrawer.tsx src/features/settings/panels/GeneralSettingsPanel.tsx src/features/settings/panels/RssSettingsPanel.tsx src/test/features/automation-rules/RulesCenterPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx
git commit -m "feat(settings): 新增规则中心并收口旧自动化入口" -m $'- 添加规则中心配置面板\n- 将旧自动化开关降级为迁移提示'
```

### Task 8: 旧配置迁移服务与全量回归

**Files:**
- Create: `src/server/domains/automation-rules/services/ruleMigrationService.ts`
- Create: `src/test/server/services/ruleMigrationService.test.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/worker/index.ts`

- [ ] **Step 1: 写失败测试，验证旧字段到规则的幂等迁移**
```ts
it('migrates legacy settings to rules only once', async () => {
  const { migrateLegacyAutomationSettings } = await import('@/server/domains/automation-rules/services/ruleMigrationService');
  const first = await migrateLegacyAutomationSettings({
    uiSettings: { general: { autoMarkReadEnabled: true, autoMarkReadDelayMs: 2000 }, rss: { articleFilter: { keyword: { enabled: true, keywords: ['广告'] }, ai: { enabled: false, prompt: '' } } } },
    feeds: [{ id: '1', aiSummaryOnFetchEnabled: true }],
    alreadyMigrated: false,
  });
  expect(first.createdRulesCount).toBeGreaterThan(0);
});
```

- [ ] **Step 2: 跑测试确认失败**
Run: `pnpm test:unit -- --run src/test/server/services/ruleMigrationService.test.ts`
Expected: FAIL，迁移服务未实现

- [ ] **Step 3: 实现迁移并接入启动触发点**
```ts
export async function migrateLegacyAutomationSettings(input: MigrateLegacyInput): Promise<{ createdRulesCount: number }> {
  if (input.alreadyMigrated) return { createdRulesCount: 0 };
  const rules = buildRulesFromLegacyInput(input);
  for (const rule of rules) {
    await createAutomationRule(input.db, rule);
  }
  await markLegacyAutomationMigrated(input.db);
  return { createdRulesCount: rules.length };
}
```

- [ ] **Step 4: 运行全量验证**
Run: `pnpm lint && pnpm type-check && pnpm test:unit && pnpm build`
Expected: 全部 PASS

- [ ] **Step 5: 提交**
```bash
git add src/server/domains/automation-rules/services/ruleMigrationService.ts src/test/server/services/ruleMigrationService.test.ts src/app/api/settings/route.ts src/worker/index.ts
git commit -m "feat(automation-rules): 添加旧配置迁移与统一启用流程" -m $'- 添加旧自动化开关到规则的幂等迁移\n- 在设置与 worker 启动流程接入迁移触发'
```

## 自检清单

- [ ] `Spec coverage`：逐项核对设计文档 1~10 节均有对应任务。
- [ ] `Suggested spec reads`：确认路径存在且与本任务直接相关。
- [ ] `Placeholder scan`：执行 `rg -n "TODO|TBD|implement later|适当|类似 Task" .superwork/plans/2026-05-14-automation-rules-center.md | rg -v "Placeholder scan"`，结果为空。
- [ ] `Type consistency`：核对 `triggerPhase/scopeType/actionType` 命名在 repository、service、route、前端一致。
