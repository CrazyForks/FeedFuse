# 账号管理改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构设置中心的账号与安全分区，让面板外只展示账号信息，所有新增和编辑操作统一收敛到弹窗内。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作流规则和跨层检查清单
- `.superwork/spec/guides/change-boundaries.md` — 先定 API 合约，再改前端消费
- `.superwork/spec/guides/verification.md` — 相关测试、`pnpm lint`、`pnpm type-check` 的验证基线
- `.superwork/spec/frontend/structure.md` — 设置中心前端代码放置约束
- `.superwork/spec/frontend/quality.md` — 交互改动必须补镜像测试
- `.superwork/spec/frontend/contracts.md` — 设置中心账号与安全交互契约
- `.superwork/spec/backend/contracts.md` — 用户接口和路由职责边界

**Architecture:** 后端先把管理员用户更新接口扩成完整 patch 合约，支持用户名、角色、状态和密码一次性更新。前端再把当前账号卡片、管理员用户表格、创建用户和编辑用户弹窗拆成清晰状态流，保留退出确认弹窗并移除所有面板内联编辑表单。

**Tech Stack:** Next.js App Router、React、Zustand、Radix Dialog、Vitest、Testing Library、pg

---

### Task 1: 扩展管理员用户更新接口

**Files:**

- Modify: `src/server/domains/auth/repositories/usersRepo.ts`
- Modify: `src/app/api/users/[id]/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Test: `src/test/server/repositories/usersRepo.test.ts`
- Test: `src/test/app/api/users/routes.test.ts`

- [ ] **Step 1: 先补仓库层和路由层失败测试**

```ts
it('updates username role status and password in one patch', async () => {
  updateUserMock.mockResolvedValue({
    id: '2',
    username: 'member-next',
    role: 'admin',
    status: 'disabled',
    sessionVersion: 3,
  });

  const mod = await import('../../../../app/api/users/[id]/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/users/2', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'member-next',
        role: 'admin',
        status: 'disabled',
        password: 'next-password-123',
      }),
    }),
    { params: Promise.resolve({ id: '2' }) },
  );

  const json = await res.json();
  expect(json.ok).toBe(true);
  expect(updateUserMock).toHaveBeenCalledWith(pool, {
    userId: '2',
    username: 'member-next',
    role: 'admin',
    status: 'disabled',
    passwordHash: 'scrypt$hashed',
  });
});
```

- [ ] **Step 2: 跑局部测试确认当前实现不支持新合约**

Run: `pnpm test:unit -- --run src/test/app/api/users/routes.test.ts src/test/server/repositories/usersRepo.test.ts`

Expected: `routes.test.ts` 因缺少 `updateUser` mock 或 PATCH 行为不符而失败。

- [ ] **Step 3: 实现统一用户 patch 能力**

```ts
export async function updateUser(
  db: DbClient,
  input: {
    userId: string;
    username?: string;
    role?: UserRole;
    status?: UserStatus;
    passwordHash?: string;
  },
): Promise<PublicUserRow | null> {
  const values: Array<string> = [input.userId];
  const assignments: string[] = [];

  if (input.username !== undefined) {
    values.push(normalizeUsername(input.username));
    assignments.push(`username = $${values.length}`);
  }
  if (input.role !== undefined) {
    values.push(input.role);
    assignments.push(`role = $${values.length}`);
  }
  if (input.status !== undefined) {
    values.push(input.status);
    assignments.push(`status = $${values.length}`);
  }
  if (input.passwordHash !== undefined) {
    values.push(input.passwordHash);
    assignments.push(`password_hash = $${values.length}`);
  }
  if (input.role !== undefined || input.status !== undefined || input.passwordHash !== undefined) {
    assignments.push('session_version = session_version + 1');
  }
  assignments.push('updated_at = now()');

  const { rows } = await db.query<PublicUserRow>(
    `
      update users
      set ${assignments.join(', ')}
      where id = $1
      returning ${publicUserColumns}
    `,
    values,
  );

  return rows[0] ?? null;
}
```

- [ ] **Step 4: 跑局部测试确认后端合约通过**

Run: `pnpm test:unit -- --run src/test/app/api/users/routes.test.ts src/test/server/repositories/usersRepo.test.ts`

Expected: PASS

### Task 2: 重做设置中心账号管理 UI

**Files:**

- Modify: `src/features/settings/panels/SecuritySettingsPanel.tsx`
- Test: `src/test/features/settings/SettingsCenterModal.test.tsx`
- Test: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

- [ ] **Step 1: 先补设置中心交互测试**

```tsx
it('opens password form from current account edit dialog', async () => {
  render(<SecuritySettingsPanel />);

  expect(screen.queryByLabelText('当前密码')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

  expect(await screen.findByRole('dialog', { name: '编辑当前账号' })).toBeInTheDocument();
  expect(screen.getByLabelText('当前密码')).toBeInTheDocument();
});
```

```tsx
it('keeps admin table read only and edits users in a dialog', async () => {
  listUsersMock.mockResolvedValue([
    { id: '1', username: 'admin', role: 'admin', status: 'active' },
    { id: '2', username: 'member', role: 'member', status: 'active' },
  ]);

  render(<SecuritySettingsPanel />);

  expect(await screen.findByText('member')).toBeInTheDocument();
  expect(screen.queryByPlaceholderText('新密码')).not.toBeInTheDocument();
  fireEvent.click(screen.getByTestId('security-user-edit-2'));

  expect(await screen.findByRole('dialog', { name: '编辑用户' })).toBeInTheDocument();
});
```

- [ ] **Step 2: 跑前端相关测试确认旧 UI 与新需求冲突**

Run: `pnpm test:unit -- --run src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: 至少一个测试因密码表单仍内联显示、用户表格仍包含内联操作而失败。

- [ ] **Step 3: 重构账号管理面板**

```tsx
<section className="space-y-5">
  <div className="rounded-lg border border-border bg-background p-4">
    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="space-y-2">
        <SettingTooltipLabel label="当前账号" description="当前登录用户和权限。" />
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <span>{currentUser?.username}</span>
          <Badge variant="secondary">{roleLabel}</Badge>
          <Badge variant={statusVariant}>{statusLabel}</Badge>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Button data-testid="security-current-user-edit-button" variant="secondary">编辑</Button>
        <Button variant="destructive">退出</Button>
      </div>
    </div>
  </div>

  {currentUser?.role === 'admin' ? (
    <div className="rounded-lg border border-border bg-background p-4">
      <div className="flex items-center justify-between">
        <SettingTooltipLabel label="用户管理" description="管理员可在弹窗中新增和编辑用户。" />
        <Button data-testid="security-create-user-button" size="compact">新增用户</Button>
      </div>
      <div className="mt-4 overflow-x-auto rounded-md border border-border">
        <table className="min-w-full divide-y divide-border text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="px-4 py-3 text-left">用户名</th>
              <th className="px-4 py-3 text-left">角色</th>
              <th className="px-4 py-3 text-left">状态</th>
              <th className="px-4 py-3 text-left">ID</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
        </table>
      </div>
    </div>
  ) : null}
</section>
```

- [ ] **Step 4: 跑前端测试确认新交互通过**

Run: `pnpm test:unit -- --run src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: PASS

### Task 3: 回归验证

**Files:**

- Verify: `src/test/app/api/users/routes.test.ts`
- Verify: `src/test/server/repositories/usersRepo.test.ts`
- Verify: `src/test/features/settings/SettingsCenterModal.test.tsx`
- Verify: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

- [ ] **Step 1: 跑本次改动的完整测试集合**

Run: `pnpm test:unit -- --run src/test/app/api/users/routes.test.ts src/test/server/repositories/usersRepo.test.ts src/test/features/settings/SettingsCenterModal.test.tsx src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: PASS

- [ ] **Step 2: 跑类型检查**

Run: `pnpm type-check`

Expected: PASS

- [ ] **Step 3: 跑 lint**

Run: `pnpm lint`

Expected: PASS
