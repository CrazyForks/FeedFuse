# Current User Unified Save Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让“当前账号”弹窗一次编辑并保存用户名与密码，前后端统一走一个接口完成校验和持久化。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — route、apiClient、feature 的跨层顺序
- `.superwork/spec/guides/verification.md` — 本次 route、shared、frontend 验证基线
- `.superwork/spec/backend/contracts.md` — 当前用户资料与密码修改契约、`session_version` 语义
- `.superwork/spec/backend/quality.md` — route 变更必须补镜像测试
- `.superwork/spec/frontend/contracts.md` — 安全分区“当前账号”弹窗统一编辑契约
- `.superwork/spec/frontend/quality.md` — 设置中心交互变更测试要求
- `.superwork/spec/shared/quality.md` — `apiClient` 语义变更要同步消费测试

**Architecture:** 保留 `PATCH /api/users/me` 作为当前用户自助编辑入口，但把 payload 扩展为可同时提交 `username`、`currentPassword`、`nextPassword`。前端“当前账号”弹窗保留一个 `保存` 按钮，只有填写了密码字段时才走改密校验；后端统一处理用户名唯一性、当前密码校验和密码 hash 更新。

**Tech Stack:** Next.js Route Handlers, React, Zustand, Vitest, pnpm

---

### Task 1: 扩展当前用户统一保存接口

**Files:**

- Modify: `src/app/api/users/me/route.ts`
- Modify: `src/test/app/api/users/routes.test.ts`

- [ ] **Step 1: 先写 route 测试覆盖统一保存成功与密码校验失败**

```ts
it('PATCH /api/users/me updates username and password together', async () => {
  getUserByIdMock.mockResolvedValue({
    id: '1',
    username: 'admin',
    passwordHash: 'scrypt$old',
    role: 'admin',
    status: 'active',
    sessionVersion: 1,
  });
  updateUserMock.mockResolvedValue({
    id: '1',
    username: 'renamed-admin',
    role: 'admin',
    status: 'active',
    sessionVersion: 2,
  });

  const mod = await import('../../../../app/api/users/me/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'renamed-admin',
        currentPassword: 'old-password-123',
        nextPassword: 'new-password-123',
      }),
    }),
  );

  expect(res.status).toBe(200);
  expect(verifyPasswordMock).toHaveBeenCalledWith('old-password-123', 'scrypt$old');
  expect(hashPasswordMock).toHaveBeenCalledWith('new-password-123');
  expect(updateUserMock).toHaveBeenCalledWith(pool, {
    userId: '1',
    username: 'renamed-admin',
    passwordHash: 'scrypt$hashed',
  });
});

it('PATCH /api/users/me rejects incomplete password change payload', async () => {
  const mod = await import('../../../../app/api/users/me/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        username: 'admin',
        nextPassword: 'new-password-123',
      }),
    }),
  );
  const json = await res.json();

  expect(res.status).toBe(422);
  expect(json.error.fields.currentPassword).toBe('请输入当前密码');
});
```

- [ ] **Step 2: 运行 route 测试确认先失败**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts`
Expected: FAIL，提示 `PATCH /api/users/me` 尚未支持统一密码保存流程。

- [ ] **Step 3: 实现 `PATCH /api/users/me` 的统一保存逻辑**

```ts
const patchCurrentUserBodySchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  currentPassword: z.string().optional().default(''),
  nextPassword: z.string().optional().default(''),
});

const shouldChangePassword =
  parsed.data.currentPassword.trim().length > 0 || parsed.data.nextPassword.trim().length > 0;

if (shouldChangePassword) {
  if (!parsed.data.currentPassword.trim()) {
    throw new ValidationError('密码校验失败', { currentPassword: '请输入当前密码' });
  }
  if (parsed.data.nextPassword.trim().length < 8) {
    throw new ValidationError('密码校验失败', { nextPassword: '新密码至少需要 8 位' });
  }

  const currentUser = await getUserById(getPool(), session.userId);
  if (!currentUser || !verifyPassword(parsed.data.currentPassword, currentUser.passwordHash)) {
    throw new UnauthorizedError('当前密码错误，请重试');
  }
}

const user = await updateUser(getPool(), {
  userId: session.userId,
  username: parsed.data.username,
  passwordHash: shouldChangePassword ? hashPassword(parsed.data.nextPassword) : undefined,
});
```

- [ ] **Step 4: 重新运行 route 测试确认通过**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 记录阶段性提交**

```bash
git add src/app/api/users/me/route.ts src/test/app/api/users/routes.test.ts
git commit -m "feat(auth): 合并当前账号资料保存接口" -m $'- 更新当前用户自助接口支持用户名与密码一次保存\n- 添加统一保存与密码校验的 route 测试'
```

### Task 2: 改当前账号弹窗为单一保存动作

**Files:**

- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/features/settings/panels/SecuritySettingsPanel.tsx`
- Modify: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`
- Modify: `src/test/features/settings/SettingsCenterModal.test.tsx`

- [ ] **Step 1: 先写前端测试覆盖统一提交和本地校验**

```ts
it('submits current account username and password through one save action', async () => {
  render(<SecuritySettingsPanel />);
  fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

  const dialog = await screen.findByRole('dialog', { name: '编辑当前账号' });
  fireEvent.change(within(dialog).getByLabelText('用户名'), { target: { value: 'renamed-admin' } });
  fireEvent.change(within(dialog).getByLabelText('当前密码'), { target: { value: 'old-password-123' } });
  fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'new-password-123' } });
  fireEvent.change(within(dialog).getByLabelText('确认新密码'), { target: { value: 'new-password-123' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

  await waitFor(() => {
    expect(updateCurrentUserProfileMock).toHaveBeenCalledWith(
      {
        username: 'renamed-admin',
        currentPassword: 'old-password-123',
        nextPassword: 'new-password-123',
      },
      { notifyOnError: false, redirectOnUnauthorized: false },
    );
  });
});

it('blocks save when password confirmation does not match', async () => {
  render(<SecuritySettingsPanel />);
  fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

  const dialog = await screen.findByRole('dialog', { name: '编辑当前账号' });
  fireEvent.change(within(dialog).getByLabelText('新密码'), { target: { value: 'new-password-123' } });
  fireEvent.change(within(dialog).getByLabelText('确认新密码'), { target: { value: 'different-password' } });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存' }));

  expect(updateCurrentUserProfileMock).not.toHaveBeenCalled();
  expect(await within(dialog).findByText('两次输入的新密码不一致')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行设置中心相关测试确认先失败**

Run: `pnpm test:unit -- src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: FAIL，提示当前弹窗仍保留 `保存用户名` 独立动作。

- [ ] **Step 3: 调整 `apiClient` 与 `SecuritySettingsPanel` 为统一保存**

```ts
export async function updateCurrentUserProfile(
  input: { username: string; currentPassword?: string; nextPassword?: string },
  options?: RequestApiOptions,
): Promise<CurrentUser> {
  return requestApi('/api/users/me', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  }, options);
}

function submitCurrentUserProfile() {
  const normalizedUsername = currentUsername.trim();
  const normalizedCurrentPassword = currentPassword.trim();
  const normalizedNextPassword = nextPassword.trim();
  const shouldChangePassword =
    normalizedCurrentPassword.length > 0 || normalizedNextPassword.length > 0 || confirmPassword.trim().length > 0;

  if (shouldChangePassword && normalizedNextPassword !== confirmPassword) {
    setIsSecurityError(true);
    setSecurityMessage('两次输入的新密码不一致');
    return;
  }

  void updateCurrentUserProfile({
    username: normalizedUsername,
    currentPassword: shouldChangePassword ? currentPassword : undefined,
    nextPassword: shouldChangePassword ? nextPassword : undefined,
  });
}
```

- [ ] **Step 4: 重新运行前端测试确认通过**

Run: `pnpm test:unit -- src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

- [ ] **Step 5: 记录阶段性提交**

```bash
git add src/lib/api/apiClient.ts src/features/settings/panels/SecuritySettingsPanel.tsx src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx
git commit -m "feat(settings): 合并当前账号弹窗保存动作" -m $'- 更新当前账号弹窗通过单一保存按钮提交用户名和密码\n- 调整前端测试覆盖统一提交与密码确认校验'
```

### Task 3: 完成验证并检查规格影响

**Files:**

- Modify: `.superwork/spec/backend/contracts.md`
- Modify: `.superwork/spec/frontend/contracts.md`

- [ ] **Step 1: 运行本次改动的核心验证**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

- [ ] **Step 2: 运行仓库基线校验**

Run: `pnpm lint`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 3: 如契约已长期变化，同步更新 spec**

```md
- `.superwork/spec/backend/contracts.md`
- `.superwork/spec/frontend/contracts.md`
```

- [ ] **Step 4: 记录最终提交**

```bash
git add .superwork/spec/backend/contracts.md .superwork/spec/frontend/contracts.md
git commit -m "docs(spec): 更新当前账号统一保存契约" -m $'- 更新当前用户自助编辑接口的长期契约描述\n- 更新设置中心当前账号弹窗统一保存交互约束'
```
