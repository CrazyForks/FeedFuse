# Fever 账号统一表单与启用开关 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Fever 账号新增和编辑共用同一弹窗表单，并支持账号启用停用与基于同步间隔的自动同步配置。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — cross-layer change order for API contracts and UI
- `.superwork/spec/frontend/contracts.md` — settings panel and Fever account interaction rules
- `.superwork/spec/backend/contracts.md` — Fever account DTO and persistence contract

**Architecture:** 先收敛 `/api/fever/accounts` 的输入契约，把 `enabled` 纳入创建与更新，并把自动同步开关改成由 `autoSyncIntervalMinutes` 是否大于 `0` 推导。前端把新增与编辑收敛到同一个 dialog 草稿模型，同时保留卡片级启用开关用于快速切换状态，并用现有 account PATCH 接口回写。

**Tech Stack:** Next.js, React, Zustand, Zod, Vitest, Testing Library, PostgreSQL repository layer

---

### Task 1: 调整 Fever account API 与仓储更新契约

**Files:**

- Modify: `src/app/api/fever/accounts/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/server/domains/fever/repositories/feverAccountsRepo.ts`
- Test: `src/test/app/api/fever/accounts/routes.test.ts`

- [ ] **Step 1: 先写接口测试，覆盖 enabled 与 interval=0 的 PATCH/POST 契约**

```ts
it('POST creates fever account with enabled flag', async () => {
  createFeverAccountMock.mockResolvedValue({
    id: '1',
    baseUrl: 'https://reader.example.com',
    username: 'demo',
    apiKey: 'secret',
    enabled: false,
    autoSyncEnabled: false,
    autoSyncIntervalMinutes: 0,
    lastSyncAt: null,
    lastError: null,
  });

  const mod = await import('../../../../../app/api/fever/accounts/route');
  await mod.POST(new Request('http://localhost/api/fever/accounts', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      baseUrl: 'https://reader.example.com',
      username: 'demo',
      apiKey: 'secret',
      enabled: false,
      autoSyncIntervalMinutes: 0,
    }),
  }));

  expect(createFeverAccountMock).toHaveBeenCalledWith(pool, {
    baseUrl: 'https://reader.example.com',
    username: 'demo',
    apiKey: 'secret',
    enabled: false,
    autoSyncIntervalMinutes: 0,
  });
});
```

- [ ] **Step 2: 跑接口测试确认先失败**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts`
Expected: FAIL，提示 `enabled` 或 `autoSyncIntervalMinutes` 断言不匹配。

- [ ] **Step 3: 更新 route、apiClient、repo 契约**

```ts
const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  enabled: z.boolean().optional().default(true),
  autoSyncIntervalMinutes: z.number().int().min(0).max(1440).optional().default(30),
});

const patchBodySchema = z.object({
  id: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().optional().default(''),
  enabled: z.boolean(),
  autoSyncIntervalMinutes: z.number().int().min(0).max(1440),
});
```

```ts
export async function updateFeverAccount(
  db: DbClient,
  input: {
    accountId: string;
    baseUrl: string;
    username: string;
    apiKey?: string;
    enabled: boolean;
    autoSyncIntervalMinutes: number;
  },
): Promise<FeverAccountRow | null> {
  const autoSyncEnabled = input.autoSyncIntervalMinutes > 0;
  // 更新 enabled，并统一由 interval 推导 auto_sync_enabled。
}
```

- [ ] **Step 4: 重新跑接口测试确认通过**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 提交这一组改动**

```bash
git add src/app/api/fever/accounts/route.ts src/lib/api/apiClient.ts src/server/domains/fever/repositories/feverAccountsRepo.ts src/test/app/api/fever/accounts/routes.test.ts
git commit -m "fix(fever): 统一账号启用与自动同步契约" -m $'- 添加 Fever 账号启用状态与同步间隔入参\n- 更新后端持久化以由间隔推导自动同步状态'
```

### Task 2: 合并新增/编辑弹窗表单并加入卡片启用开关

**Files:**

- Modify: `src/features/settings/panels/FeverAccountSettingsPanel.tsx`
- Test: `src/test/features/settings/feverAccountSettings.test.tsx`

- [ ] **Step 1: 先写前端测试，覆盖统一弹窗、中文字段文案、卡片开关与 interval=0 自动关闭**

```ts
it('uses one dialog for create and edit with enabled switch and password placeholder', async () => {
  render(<FeverAccountSettingsPanel />);

  fireEvent.click(screen.getByRole('button', { name: '添加 Fever 账号' }));

  expect(screen.getByRole('dialog', { name: '添加 Fever 服务' })).toBeInTheDocument();
  expect(screen.getByLabelText('fever 地址')).toBeInTheDocument();
  expect(screen.getByLabelText('用户名')).toBeInTheDocument();
  expect(screen.getByLabelText('密码')).toHaveAttribute('placeholder', '留空表示不修改');
  expect(screen.getByRole('switch', { name: '启用该 Fever 服务' })).toBeChecked();
});
```

- [ ] **Step 2: 跑前端测试确认先失败**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx`
Expected: FAIL，提示旧文案、旧双弹窗结构或缺少开关。

- [ ] **Step 3: 重构为共享 dialog 草稿并补充卡片 switch**

```tsx
type AccountFormDraft = {
  id: string | null;
  baseUrl: string;
  username: string;
  apiKey: string;
  enabled: boolean;
  autoSyncIntervalMinutes: number;
};

// 用一个 dialog 模式承载 create/edit，避免两套表单状态分叉。
const [dialogMode, setDialogMode] = useState<'create' | 'edit' | null>(null);
const [formDraft, setFormDraft] = useState<AccountFormDraft>(DEFAULT_FORM_DRAFT);
```

```tsx
<Switch
  aria-label={`${account.username} 启用状态`}
  checked={account.enabled}
  disabled={savingAccountId === account.id}
  onCheckedChange={(checked) => {
    void handleToggleAccountEnabled(account, checked);
  }}
/>
```

```ts
const normalizedInterval = Math.max(0, Math.min(1440, Math.round(formDraft.autoSyncIntervalMinutes)));
const payload = {
  ...,
  enabled: formDraft.enabled,
  autoSyncIntervalMinutes: normalizedInterval,
};
```

- [ ] **Step 4: 重新跑前端测试确认通过**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx`
Expected: PASS

- [ ] **Step 5: 提交这一组改动**

```bash
git add src/features/settings/panels/FeverAccountSettingsPanel.tsx src/test/features/settings/feverAccountSettings.test.tsx
git commit -m "feat(settings): 统一 Fever 服务表单与卡片开关" -m $'- 重构 Fever 设置为单一新增编辑弹窗\n- 添加服务启用开关并更新中文字段文案'
```

### Task 3: 做回归验证并准备收尾

**Files:**

- Modify: `src/features/settings/panels/FeverAccountSettingsPanel.tsx`
- Test: `src/test/app/api/fever/accounts/routes.test.ts`
- Test: `src/test/features/settings/feverAccountSettings.test.tsx`

- [ ] **Step 1: 跑本次改动相关测试集**

Run: `pnpm test:unit -- --run src/test/app/api/fever/accounts/routes.test.ts src/test/features/settings/feverAccountSettings.test.tsx`
Expected: PASS

- [ ] **Step 2: 跑静态检查**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: 跑类型检查**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 4: 检查是否需要更新 spec**

```text
本次改动没有新增长期模块边界，也没有改变 Fever API 的职责分层；
仅调整既有字段语义与设置页交互，默认先记录为 no-update，
除非实现中发现新的持久化规则需要写回 .superwork/spec/frontend/contracts.md 或 backend/contracts.md。
```

- [ ] **Step 5: 提交最终收尾**

```bash
git add src/features/settings/panels/FeverAccountSettingsPanel.tsx src/app/api/fever/accounts/route.ts src/lib/api/apiClient.ts src/server/domains/fever/repositories/feverAccountsRepo.ts src/test/app/api/fever/accounts/routes.test.ts src/test/features/settings/feverAccountSettings.test.tsx
git commit -m "fix(settings): 完成 Fever 服务启用与统一表单收尾" -m $'- 验证 Fever 设置页与账号接口回归通过\n- 保持同步间隔与启用状态回显一致'
```
