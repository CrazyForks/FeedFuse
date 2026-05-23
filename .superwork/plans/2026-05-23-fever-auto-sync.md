# Fever Auto Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Fever 账号增加可配置的后台定时同步，让 worker 自动按计划入队现有 `fever.sync` 任务。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — cross-layer ordering and worker/service boundaries
- `.superwork/spec/backend/index.md` — backend verification and migration checklist
- `.superwork/spec/backend/contracts.md` — Fever route/service/worker contract
- `.superwork/spec/frontend/index.md` — frontend verification checklist
- `.superwork/spec/frontend/contracts.md` — Fever settings panel API usage contract

**Architecture:** 保持 `fever.sync` 作为唯一同步执行入口，新建一个每分钟运行的 worker 调度任务，只负责挑选到期账号并入队。账号的自动同步开关、间隔和最近一次尝试时间落在 `fever_accounts`，前端设置面板通过 `/api/fever/accounts` 读写这些字段。

**Tech Stack:** Next.js route handlers, pg/SQL migrations, pg-boss workers, React Testing Library, Vitest

---

### Task 1: 扩展 Fever 账号配置与 API

**Files:**

- Create: `src/server/infra/db/migrations/0030_fever_auto_sync.sql`
- Modify: `src/server/domains/fever/repositories/feverAccountsRepo.ts`
- Modify: `src/app/api/fever/accounts/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Test: `src/test/server/db/migrations/feverSourcesMigration.test.ts`
- Test: `src/test/app/api/fever/accounts/routes.test.ts`

- [ ] **Step 1: 先补 migration / API 失败测试**

```ts
it('PATCH updates fever auto sync settings', async () => {
  updateFeverAccountAutoSyncSettingsMock.mockResolvedValue({
    id: '1',
    baseUrl: 'https://reader.example.com',
    username: 'demo',
    enabled: true,
    autoSyncEnabled: true,
    autoSyncIntervalMinutes: 30,
    lastSyncAt: null,
    lastError: null,
  });

  const mod = await import('../../../../../app/api/fever/accounts/route');
  const response = await mod.PATCH(
    new Request('http://localhost/api/fever/accounts', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: '1',
        autoSyncEnabled: true,
        autoSyncIntervalMinutes: 30,
      }),
    }),
  );

  const json = await response.json();
  expect(json.ok).toBe(true);
  expect(json.data.autoSyncIntervalMinutes).toBe(30);
});
```

- [ ] **Step 2: 跑对应测试，确认当前失败**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts src/test/server/db/migrations/feverSourcesMigration.test.ts`
Expected: FAIL，提示缺少 `PATCH` 路由、DTO 字段或 migration 断言不满足。

- [ ] **Step 3: 实现 migration、repo 字段与 PATCH 路由**

```sql
alter table fever_accounts
  add column if not exists auto_sync_enabled boolean not null default true,
  add column if not exists auto_sync_interval_minutes integer not null default 30,
  add column if not exists last_sync_attempt_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fever_accounts_auto_sync_interval_minutes_check'
  ) then
    alter table fever_accounts
      add constraint fever_accounts_auto_sync_interval_minutes_check
      check (auto_sync_interval_minutes between 5 and 1440);
  end if;
end $$;
```

```ts
const patchBodySchema = z.object({
  id: z.string().trim().min(1),
  autoSyncEnabled: z.boolean(),
  autoSyncIntervalMinutes: z.number().int().min(5).max(1440),
});

function sanitizeFeverAccount(account: FeverAccountRow) {
  return {
    id: account.id,
    baseUrl: account.baseUrl,
    username: account.username,
    enabled: account.enabled,
    autoSyncEnabled: account.autoSyncEnabled,
    autoSyncIntervalMinutes: account.autoSyncIntervalMinutes,
    lastSyncAt: account.lastSyncAt,
    lastError: account.lastError,
  };
}
```

- [ ] **Step 4: 再跑目标测试，确认接口与 migration 通过**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts src/test/server/db/migrations/feverSourcesMigration.test.ts`
Expected: PASS

- [ ] **Step 5: 提交这一段改动**

```bash
git add src/server/infra/db/migrations/0030_fever_auto_sync.sql src/server/domains/fever/repositories/feverAccountsRepo.ts src/app/api/fever/accounts/route.ts src/lib/api/apiClient.ts src/test/app/api/fever/accounts/routes.test.ts src/test/server/db/migrations/feverSourcesMigration.test.ts
git commit -m "feat(fever): 添加账号自动同步配置" -m $'- 添加 Fever 账号自动同步字段与校验\n- 更新账号接口与 DTO 返回定时同步配置'
```

### Task 2: 添加后台定时调度 worker

**Files:**

- Create: `src/worker/feverAutoSync.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/server/infra/queue/jobs.ts`
- Modify: `src/server/infra/queue/contracts.ts`
- Test: `src/test/worker/feverAutoSync.test.ts`
- Test: `src/test/server/queue/contracts.test.ts`

- [ ] **Step 1: 先补 worker 调度失败测试**

```ts
it('selects due auto sync accounts by last attempt time', async () => {
  const now = new Date('2026-05-23T10:00:00.000Z');
  const due = selectFeverAccountsForAutoSync([
    {
      id: 'due-1',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      createdAt: '2026-05-23T08:00:00.000Z',
      lastSyncAt: '2026-05-23T09:00:00.000Z',
      lastSyncAttemptAt: null,
    },
    {
      id: 'skip-1',
      enabled: true,
      autoSyncEnabled: true,
      autoSyncIntervalMinutes: 30,
      createdAt: '2026-05-23T08:00:00.000Z',
      lastSyncAt: '2026-05-23T09:45:00.000Z',
      lastSyncAttemptAt: null,
    },
  ], now);

  expect(due.map((account) => account.id)).toEqual(['due-1']);
});
```

- [ ] **Step 2: 跑 worker/queue 测试，确认当前失败**

Run: `pnpm test:unit -- --run src/test/worker/feverAutoSync.test.ts src/test/server/queue/contracts.test.ts`
Expected: FAIL，提示缺少 `fever.sync_due` 调度或选择器实现。

- [ ] **Step 3: 实现自动调度逻辑并复用现有 `fever.sync`**

```ts
export function selectFeverAccountsForAutoSync(
  accounts: FeverAccountRow[],
  now: Date,
) {
  return accounts.filter((account) => {
    if (!account.enabled || !account.autoSyncEnabled) {
      return false;
    }

    const baseline = account.lastSyncAt ?? account.lastSyncAttemptAt ?? account.createdAt;
    const baselineTime = new Date(baseline).getTime();
    if (Number.isNaN(baselineTime)) {
      return true;
    }

    return now.getTime() - baselineTime >= account.autoSyncIntervalMinutes * 60_000;
  });
}
```

```ts
await boss.schedule(JOB_FEVER_SYNC_DUE, '* * * * *');
await boss.send(JOB_FEVER_SYNC_DUE, {}, getQueueSendOptions(JOB_FEVER_SYNC_DUE, {}));
```

- [ ] **Step 4: 运行目标测试，确认调度行为通过**

Run: `pnpm test:unit -- --run src/test/worker/feverAutoSync.test.ts src/test/server/queue/contracts.test.ts src/test/worker/feverSync.test.ts`
Expected: PASS

- [ ] **Step 5: 提交后台调度改动**

```bash
git add src/worker/feverAutoSync.ts src/worker/index.ts src/server/infra/queue/jobs.ts src/server/infra/queue/contracts.ts src/test/worker/feverAutoSync.test.ts src/test/server/queue/contracts.test.ts src/test/worker/feverSync.test.ts
git commit -m "feat(worker): 添加 Fever 定时同步调度" -m $'- 添加后台定时扫描并入队 Fever 同步任务\n- 复用现有 fever.sync 执行链路避免重复同步实现'
```

### Task 3: 暴露设置面板自动同步配置

**Files:**

- Modify: `src/features/settings/panels/FeverAccountSettingsPanel.tsx`
- Test: `src/test/features/settings/feverAccountSettings.test.tsx`
- Test: `src/test/features/settings/SettingsCenterModal.test.tsx`

- [ ] **Step 1: 先补设置面板失败测试**

```tsx
it('updates auto sync settings for an existing fever account', async () => {
  render(<FeverAccountSettingsPanel />);

  const intervalInput = await screen.findByLabelText('自动同步间隔（分钟）');
  fireEvent.change(intervalInput, { target: { value: '45' } });
  fireEvent.click(screen.getByRole('button', { name: '保存自动同步' }));

  await waitFor(() => {
    expect(runImmediateSuccessMock).toHaveBeenCalledWith({
      actionKey: 'fever.sync',
      context: { outcome: 'settings_saved' },
    });
  });
});
```

- [ ] **Step 2: 跑前端目标测试，确认当前失败**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: FAIL，提示缺少自动同步控件或 PATCH 请求。

- [ ] **Step 3: 实现设置面板控件与保存逻辑**

```tsx
<Switch
  aria-label={`启用 ${account.username} 自动同步`}
  checked={draft.autoSyncEnabled}
  onCheckedChange={(checked) => updateAccountDraft(account.id, { autoSyncEnabled: checked })}
/>
<Input
  aria-label="自动同步间隔（分钟）"
  type="number"
  min={5}
  max={1440}
  step={5}
  value={String(draft.autoSyncIntervalMinutes)}
  onChange={(event) => updateAccountDraft(account.id, {
    autoSyncIntervalMinutes: Number(event.target.value) || 5,
  })}
/>
```

- [ ] **Step 4: 运行前端测试，确认交互通过**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交 UI 改动**

```bash
git add src/features/settings/panels/FeverAccountSettingsPanel.tsx src/test/features/settings/feverAccountSettings.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx
git commit -m "feat(settings): 暴露 Fever 自动同步设置" -m $'- 添加 Fever 账号自动同步开关与间隔输入\n- 更新设置面板测试覆盖保存与回显行为'
```

### Task 4: 全量验证与规格回写

**Files:**

- Modify: `.superwork/spec/backend/contracts.md`
- Modify: `.superwork/spec/frontend/contracts.md`

- [ ] **Step 1: 运行本次改动所需验证**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts src/test/server/db/migrations/feverSourcesMigration.test.ts src/test/server/queue/contracts.test.ts src/test/worker/feverAutoSync.test.ts src/test/worker/feverSync.test.ts src/test/features/settings/feverAccountSettings.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行 lint 和 type-check**

Run: `pnpm lint`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: 更新持久规格**

```md
- Fever 账号配置除了连接信息，还包括 `autoSyncEnabled`、`autoSyncIntervalMinutes`；
- 后台每分钟调度一次到期账号，但实际同步仍统一走 `fever.sync`；
- 设置面板必须通过 `src/lib/api/apiClient.ts` 调用 `/api/fever/accounts` PATCH 保存计划。
```

- [ ] **Step 4: 提交规格改动**

```bash
git add .superwork/spec/backend/contracts.md .superwork/spec/frontend/contracts.md
git commit -m "docs(spec): 更新 Fever 自动同步契约" -m $'- 更新后端定时同步调度与账号字段规则\n- 补充前端设置面板保存自动同步配置的约束'
```
