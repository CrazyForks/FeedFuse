# User Username Editability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 允许所有用户修改自己的用户名，并保持管理员编辑其他用户与初始用户权限语义稳定，保存时校验用户名唯一性。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists
- `.superwork/spec/guides/change-boundaries.md` — route、repository、apiClient、UI 的跨层变更顺序
- `.superwork/spec/guides/verification.md` — 本次前后端与 shared 改动的验证基线
- `.superwork/spec/backend/contracts.md` — 多用户权限、用户名唯一性、`session_version` 语义
- `.superwork/spec/backend/quality.md` — route / repository 变更必须补镜像测试
- `.superwork/spec/frontend/contracts.md` — 安全分区当前账号与用户管理弹窗契约
- `.superwork/spec/frontend/quality.md` — 设置中心交互改动的前端测试要求
- `.superwork/spec/shared/quality.md` — `src/lib/api/apiClient.ts` 语义变更需补消费测试

**Architecture:** 保持 `PATCH /api/users/[id]` 作为管理员编辑其他用户的入口，新增 `PATCH /api/users/me` 只允许当前登录用户修改自己的 `username`。前端在“当前账号”弹窗中新增用户名编辑并调用新的 api client 封装，同时把“初始用户”识别收敛为固定 `id === '1'`，避免用户名改动后破坏隐藏/删除权限语义。

**Tech Stack:** Next.js Route Handlers, React, Zustand, Vitest, pnpm

---

### Task 1: 后端补当前用户自助改用户名入口并稳定初始用户语义

**Files:**

- Create: `src/app/api/users/me/route.ts`
- Modify: `src/app/api/users/[id]/route.ts`
- Modify: `src/test/app/api/users/routes.test.ts`

- [ ] **Step 1: 先写 route 测试覆盖当前用户改用户名与唯一性冲突**

```ts
it('PATCH /api/users/me updates current user username without rotating role semantics', async () => {
  updateUserMock.mockResolvedValue({
    id: '1',
    username: 'renamed-admin',
    role: 'admin',
    status: 'active',
    sessionVersion: 1,
  });

  const mod = await import('../../../../app/api/users/me/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'renamed-admin' }),
    }),
  );
  const json = await res.json();

  expect(json.ok).toBe(true);
  expect(updateUserMock).toHaveBeenCalledWith(pool, {
    userId: '1',
    username: 'renamed-admin',
  });
});

it('PATCH /api/users/me returns 409 when username already exists', async () => {
  updateUserMock.mockRejectedValue({ code: '23505' });

  const mod = await import('../../../../app/api/users/me/route');
  const res = await mod.PATCH(
    new Request('http://localhost/api/users/me', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: 'member' }),
    }),
  );
  const json = await res.json();

  expect(res.status).toBe(409);
  expect(json.error.code).toBe('conflict');
});

it('DELETE still allows the renamed initial admin to delete others', async () => {
  getUserByIdMock
    .mockResolvedValueOnce({
      id: '1',
      username: 'renamed-admin',
      passwordHash: 'hash',
      role: 'admin',
      status: 'active',
      sessionVersion: 1,
    })
    .mockResolvedValueOnce({
      id: '2',
      username: 'member',
      passwordHash: 'hash',
      role: 'member',
      status: 'active',
      sessionVersion: 1,
    });
  deleteUserAndOwnedDataMock.mockResolvedValue(true);

  const mod = await import('../../../../app/api/users/[id]/route');
  const res = await mod.DELETE(
    new Request('http://localhost/api/users/2', { method: 'DELETE' }),
    { params: Promise.resolve({ id: '2' }) },
  );

  expect(res.status).toBe(200);
});
```

- [ ] **Step 2: 运行用户 route 测试确认先失败**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts`
Expected: FAIL，提示 `src/app/api/users/me/route.ts` 缺失或当前账号用户名更新断言不满足。

- [ ] **Step 3: 实现 `PATCH /api/users/me` 并把初始用户判断改为只认固定 id**

```ts
const patchCurrentUserBodySchema = z.object({
  username: z.string().trim().min(1),
});

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = patchCurrentUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    // 当前账号自助入口只允许改用户名，避免把管理员编辑语义混进普通用户链路。
    const user = await updateUser(getPool(), {
      userId: session.userId,
      username: parsed.data.username,
    });
    if (!user) {
      throw new NotFoundError('用户不存在');
    }

    return ok(user);
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(new ConflictError('用户名已存在', { username: 'duplicate' }));
    }
    return fail(err);
  }
}

function isInitialUser(user: { id: string }): boolean {
  return user.id === '1';
}
```

- [ ] **Step 4: 重新运行用户 route 测试确认通过**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts`
Expected: PASS

- [ ] **Step 5: 记录一个阶段性提交**

```bash
git add src/app/api/users/me/route.ts src/app/api/users/[id]/route.ts src/test/app/api/users/routes.test.ts
git commit -m "feat(auth): 添加当前用户用户名修改入口" -m $'- 添加当前账号自助修改用户名的 route 测试与实现\n- 更新初始用户识别逻辑仅依赖固定用户 ID'
```

### Task 2: 前端当前账号弹窗支持改用户名并复用唯一性错误

**Files:**

- Modify: `src/lib/api/apiClient.ts`
- Modify: `src/features/settings/panels/SecuritySettingsPanel.tsx`
- Modify: `src/test/features/settings/panels/SecuritySettingsPanel.test.tsx`
- Modify: `src/test/features/settings/SettingsCenterModal.test.tsx`

- [ ] **Step 1: 先写前端测试覆盖当前账号弹窗用户名编辑**

```ts
it('submits current account username edits through updateCurrentUserProfile', async () => {
  render(<SecuritySettingsPanel />);

  fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

  const dialog = await screen.findByRole('dialog', { name: '编辑当前账号' });
  fireEvent.change(within(dialog).getByLabelText('用户名'), {
    target: { value: 'renamed-admin' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存用户名' }));

  await waitFor(() => {
    expect(updateCurrentUserProfileMock).toHaveBeenCalledWith(
      { username: 'renamed-admin' },
      { notifyOnError: false, redirectOnUnauthorized: false },
    );
  });
});

it('shows duplicate username error in current account dialog', async () => {
  updateCurrentUserProfileMock.mockRejectedValueOnce(
    new ApiError('用户名已存在', 'conflict', { username: 'duplicate' }),
  );

  render(<SecuritySettingsPanel />);
  fireEvent.click(screen.getByTestId('security-current-user-edit-button'));

  const dialog = await screen.findByRole('dialog', { name: '编辑当前账号' });
  fireEvent.change(within(dialog).getByLabelText('用户名'), {
    target: { value: 'member' },
  });
  fireEvent.click(within(dialog).getByRole('button', { name: '保存用户名' }));

  expect(await within(dialog).findByText('用户名已存在')).toBeInTheDocument();
});
```

- [ ] **Step 2: 运行设置面板相关测试确认先失败**

Run: `pnpm test:unit -- src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: FAIL，提示缺少当前账号用户名输入或 `updateCurrentUserProfile` 未实现。

- [ ] **Step 3: 在 api client 与安全面板实现当前账号用户名保存**

```ts
export async function updateCurrentUserProfile(
  input: { username: string },
  options?: RequestApiOptions,
): Promise<CurrentUser> {
  return requestApi(
    '/api/users/me',
    {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
    {
      ...(options ?? {}),
      redirectOnUnauthorized: false,
    },
  );
}

const [currentUsername, setCurrentUsername] = useState('');
const [isProfilePending, startProfileTransition] = useTransition();

const submitCurrentUserProfile = () => {
  const normalizedUsername = currentUsername.trim();
  if (!normalizedUsername) {
    setIsSecurityError(true);
    setSecurityMessage('请输入用户名');
    return;
  }

  startProfileTransition(() => {
    void updateCurrentUserProfile(
      { username: normalizedUsername },
      { notifyOnError: false, redirectOnUnauthorized: false },
    )
      .then((updated) => {
        setCurrentUser(updated);
        setUsers((items) => items.map((item) => (item.id === updated.id ? updated : item)));
        setCurrentUsername(updated.username ?? normalizedUsername);
        setIsSecurityError(false);
        setSecurityMessage('用户名已更新');
      })
      .catch((err) => {
        setIsSecurityError(true);
        setSecurityMessage(err instanceof ApiError ? err.message : '更新用户名失败');
      });
  });
};
```

- [ ] **Step 4: 重新运行设置面板测试确认通过**

Run: `pnpm test:unit -- src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

- [ ] **Step 5: 记录一个阶段性提交**

```bash
git add src/lib/api/apiClient.ts src/features/settings/panels/SecuritySettingsPanel.tsx src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx
git commit -m "feat(settings): 允许当前账号修改用户名" -m $'- 添加当前账号用户名编辑输入与保存动作\n- 复用后端唯一性冲突错误反馈'
```

### Task 3: 验证与规格决策

**Files:**

- Modify: `.superwork/spec/backend/contracts.md`
- Modify: `.superwork/spec/frontend/contracts.md`

- [ ] **Step 1: 跑本次改动的完整针对性验证**

Run: `pnpm test:unit -- src/test/app/api/users/routes.test.ts src/test/features/settings/panels/SecuritySettingsPanel.test.tsx src/test/features/settings/SettingsCenterModal.test.tsx`
Expected: PASS

Run: `pnpm lint`
Expected: PASS

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 2: 更新长期契约文档**

```md
- `PATCH /api/users/me` 只允许当前登录用户修改自己的 `username`；唯一性冲突继续返回 `用户名已存在`，纯用户名编辑不递增 `session_version`。
- 设置中心“当前账号”弹窗同时承载用户名编辑与密码修改；初始用户是否具备特殊管理权限只由固定 `id = 1` 判断，不再依赖 `username`。
```

- [ ] **Step 3: 记录规格更新提交**

```bash
git add .superwork/spec/backend/contracts.md .superwork/spec/frontend/contracts.md
git commit -m "docs(auth): 更新用户名编辑与初始用户契约" -m $'- 更新当前账号用户名修改接口与唯一性规则\n- 明确初始用户特殊权限仅依赖固定用户 ID'
```
