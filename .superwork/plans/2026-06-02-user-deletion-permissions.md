# 用户删除权限 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 添加删除用户能力，并强制执行“初始用户不可删除、其他用户都可删除、仅初始用户可以删除其他用户”的权限规则

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享工作流规则和项目级检查清单
- `.superwork/spec/guides/change-boundaries.md` — 先定 route/repository 边界，再接前端消费
- `.superwork/spec/guides/verification.md` — 本次前后端与仓库测试的验证基线
- `.superwork/spec/backend/index.md` — 后端 API 与 repository 改动的验证范围
- `.superwork/spec/backend/contracts.md` — 多用户鉴权与用户管理接口契约
- `.superwork/spec/frontend/index.md` — 设置中心前端改动范围
- `.superwork/spec/frontend/contracts.md` — 用户管理面板与初始管理员展示规则

**Architecture:** 在 `usersRepo` 增加删除能力，并通过 route 显式校验“操作者必须是初始用户、目标用户不能是初始用户、不能删除自己”。前端安全面板只给满足条件的用户显示删除入口，并通过确认弹窗调用新的删除接口。

**Tech Stack:** Next.js App Router、TypeScript、React、Vitest、Testing Library、pnpm

---

### Task 1: 补齐用户删除后端契约

**Files:**

- Modify: `src/server/domains/auth/repositories/usersRepo.ts`
- Modify: `src/app/api/users/[id]/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Test: `src/test/server/repositories/usersRepo.test.ts`
- Test: `src/test/app/api/users/routes.test.ts`

- [ ] **Step 1: 先补 repository 与 route 失败测试**

```ts
it('deletes a non-initial user by id', async () => {
  const query = vi.fn().mockResolvedValue({ rowCount: 1 });
  const pool = { query } as unknown as Pool;

  const deleted = await deleteUser(pool, { userId: '2' });

  expect(deleted).toBe(true);
  expect(String(query.mock.calls[0]?.[0] ?? '')).toContain('delete from users');
  expect(query.mock.calls[0]?.[1]).toEqual(['2']);
});
```

```ts
it('DELETE rejects non-initial admin even if role is admin', async () => {
  requireApiSessionMock.mockResolvedValue({ userId: '3', role: 'admin', sessionVersion: 1 });
  getUserByIdMock.mockResolvedValueOnce({
    id: '3',
    username: 'ops-admin',
    passwordHash: 'hash',
    role: 'admin',
    status: 'active',
    sessionVersion: 1,
  });

  const mod = await import('../../../../app/api/users/[id]/route');
  const res = await mod.DELETE(
    new Request('http://localhost/api/users/2', { method: 'DELETE' }),
    { params: Promise.resolve({ id: '2' }) },
  );

  expect(res.status).toBe(403);
});
```

- [ ] **Step 2: 跑局部测试确认删除能力尚未实现**

Run: `pnpm test:unit -- --run src/test/server/repositories/usersRepo.test.ts src/test/app/api/users/routes.test.ts`

Expected: FAIL，因为 `deleteUser` 和 `DELETE /api/users/[id]` 尚不存在。

- [ ] **Step 3: 实现后端删除能力与权限校验**

```ts
export async function deleteUser(
  db: DbClient,
  input: { userId: string },
): Promise<boolean> {
  const result = await db.query(
    `
      delete from users
      where id = $1
    `,
    [input.userId],
  );

  return (result.rowCount ?? 0) > 0;
}
```

```ts
const actor = await getUserById(getPool(), session.userId);
if (!actor || actor.username !== 'admin') {
  return fail(new ForbiddenError('仅初始用户可以删除其他用户'));
}

const target = await getUserById(getPool(), parsedId.data);
if (!target) {
  throw new NotFoundError('用户不存在');
}
if (target.username === 'admin') {
  return fail(new ForbiddenError('初始用户不可删除'));
}
if (target.id === session.userId) {
  return fail(new ForbiddenError('不能删除当前登录用户'));
}
```

- [ ] **Step 4: 更新 API 客户端删除封装**

```ts
export async function deleteUser(
  userId: string,
  options?: RequestApiOptions,
): Promise<{ deleted: boolean }> {
  return requestApi(
    `/api/users/${encodeURIComponent(userId)}`,
    { method: 'DELETE' },
    options,
  );
}
```

- [ ] **Step 5: 跑后端局部测试**

Run: `pnpm test:unit -- --run src/test/server/repositories/usersRepo.test.ts src/test/app/api/users/routes.test.ts`

Expected: PASS

### Task 2: 添加设置中心删除交互

**Files:**

- Modify: `src/features/settings/panels/SecuritySettingsPanel.tsx`
- Test: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

- [ ] **Step 1: 先补前端失败测试**

```tsx
it('shows delete action only for initial admin and deletes non-initial users through confirm dialog', async () => {
  render(<SecuritySettingsPanel />);

  expect(await screen.findByTestId('security-user-delete-2')).toBeInTheDocument();
  fireEvent.click(screen.getByTestId('security-user-delete-2'));

  const dialog = await screen.findByRole('alertdialog');
  fireEvent.click(within(dialog).getByRole('button', { name: '删除' }));

  await waitFor(() => {
    expect(deleteUserMock).toHaveBeenCalledWith('2', { notifyOnError: false });
  });
});
```

```tsx
it('hides delete action for non-initial admin users', async () => {
  useAuthStore.setState({
    currentUser: {
      id: '3',
      username: 'ops-admin',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
    },
  });

  render(<SecuritySettingsPanel />);
  expect(await screen.findByText('member')).toBeInTheDocument();
  expect(screen.queryByTestId('security-user-delete-2')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: 跑前端局部测试确认当前 UI 没有删除能力**

Run: `pnpm test:unit -- --run src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: FAIL，因为没有删除按钮和确认流程。

- [ ] **Step 3: 实现删除按钮与确认弹窗**

```tsx
{canDeleteManagedUsers ? (
  <Button
    type="button"
    size="compact"
    variant="destructive"
    data-testid={`security-user-delete-${user.id}`}
    onClick={() => openDeleteDialog(user)}
  >
    删除
  </Button>
) : null}
```

```tsx
<AlertDialog open={Boolean(deletingUser)} onOpenChange={(open) => !open && closeDeleteDialog()}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>删除用户</AlertDialogTitle>
      <AlertDialogDescription>
        删除后将移除该用户及其关联数据，此操作不可恢复。
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel disabled={isDeletePending}>取消</AlertDialogCancel>
      <Button type="button" variant="destructive" onClick={submitDeleteUser} disabled={isDeletePending}>
        {isDeletePending ? '删除中…' : '删除'}
      </Button>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

- [ ] **Step 4: 跑前端局部测试**

Run: `pnpm test:unit -- --run src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: PASS

### Task 3: 回归验证与规格决策

**Files:**

- Verify: `src/test/server/repositories/usersRepo.test.ts`
- Verify: `src/test/app/api/users/routes.test.ts`
- Verify: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`
- Modify if needed: `.superwork/spec/backend/contracts.md`
- Modify if needed: `.superwork/spec/frontend/contracts.md`

- [ ] **Step 1: 跑本次相关测试集合**

Run: `pnpm test:unit -- --run src/test/server/repositories/usersRepo.test.ts src/test/app/api/users/routes.test.ts src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`

Expected: PASS

- [ ] **Step 2: 跑类型检查与 lint**

Run: `pnpm type-check`

Expected: PASS

Run: `pnpm lint`

Expected: PASS

- [ ] **Step 3: 明确规格更新决策**

如果实现沉淀了“仅初始用户可删人”的长期规则，则同步更新后端和前端契约；否则记录 `no-update`。
