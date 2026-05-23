# Fever 设置区重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将设置中心的 `fever` 内容区改为精简卡片列表，并把新增与编辑操作迁移到独立 modal 表单。

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — 共享流程与验证基线
- `.superwork/spec/guides/verification.md` — 前端改动的测试与构建回归要求
- `.superwork/spec/frontend/index.md` — 设置中心所在前端层职责与验证清单
- `.superwork/spec/frontend/structure.md` — `src/features/settings/**` 的组件放置规则
- `.superwork/spec/frontend/quality.md` — 设置中心交互改动的测试要求
- `.superwork/spec/frontend/contracts.md` — 设置中心保存逻辑与 Fever 分区交互契约

**Architecture:** 保持现有 Fever API 不变，只重构 `FeverAccountSettingsPanel` 的前端呈现与交互组织。主面板展示账号摘要卡片，新增账号使用独立创建 modal，编辑账号使用独立自动同步配置 modal，删除仍复用确认对话框。

**Tech Stack:** React, Next.js, Radix Dialog, Vitest, Testing Library

---

### Task 1: 先补卡片与 modal 行为测试

**Files:**

- Modify: `src/test/features/settings/feverAccountSettings.test.tsx`
- Test: `src/test/features/settings/feverAccountSettings.test.tsx`

- [ ] **Step 1: 写失败测试，覆盖新增 modal 打开与提交后生成卡片**

```tsx
it('opens create modal and creates fever account card', async () => {
  render(<FeverAccountSettingsPanel />);

  fireEvent.click(screen.getByRole('button', { name: '添加 Fever 账号' }));

  expect(screen.getByRole('dialog', { name: '添加 Fever 账号' })).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText('Base URL'), {
    target: { value: 'https://reader.example.com' },
  });
  fireEvent.change(screen.getByLabelText('Username'), {
    target: { value: 'demo' },
  });
  fireEvent.change(screen.getByLabelText('API Key'), {
    target: { value: 'secret' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存账号' }));

  await waitFor(() => {
    expect(screen.getByText('demo')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: '添加 Fever 账号' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 写失败测试，覆盖编辑 modal 回填与保存自动同步**

```tsx
it('opens edit modal, updates auto sync settings, and reflects saved values', async () => {
  render(<FeverAccountSettingsPanel />);

  await screen.findByText('demo');
  fireEvent.click(screen.getByRole('button', { name: '编辑 demo' }));

  expect(screen.getByRole('dialog', { name: '编辑 Fever 账号' })).toBeInTheDocument();
  expect(screen.getByDisplayValue('30')).toBeInTheDocument();

  fireEvent.click(screen.getByRole('switch', { name: '启用 demo 自动同步' }));
  fireEvent.change(screen.getByLabelText('自动同步间隔（分钟）'), {
    target: { value: '45' },
  });
  fireEvent.click(screen.getByRole('button', { name: '保存自动同步' }));

  await waitFor(() => {
    expect(runImmediateSuccessMock).toHaveBeenCalledWith({
      actionKey: 'fever.sync',
      context: { outcome: 'settings_saved' },
    });
  });
  expect(screen.getByText('45 分钟')).toBeInTheDocument();
});
```

- [ ] **Step 3: 写失败测试，覆盖卡片仅展示摘要信息与主区不再直接渲染表单字段**

```tsx
it('shows compact account cards without inline create form fields', async () => {
  render(<FeverAccountSettingsPanel />);

  await screen.findByText('demo');

  expect(screen.queryByLabelText('Base URL')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('API Key')).not.toBeInTheDocument();
  expect(screen.getByText('自动同步')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '编辑 demo' })).toBeInTheDocument();
});
```

- [ ] **Step 4: 运行定向测试，确认当前实现失败**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx`
Expected: FAIL，原因是当前面板仍使用内联表单且没有编辑 modal。

### Task 2: 重构 Fever 设置面板为卡片列表与独立 modal

**Files:**

- Modify: `src/features/settings/panels/FeverAccountSettingsPanel.tsx`

- [ ] **Step 1: 添加创建与编辑 modal 状态，拆分表单草稿**

```tsx
const [createDialogOpen, setCreateDialogOpen] = useState(false);
const [editAccountId, setEditAccountId] = useState<string | null>(null);
const [creatingAccount, setCreatingAccount] = useState(false);
const [createDraft, setCreateDraft] = useState({
  baseUrl: '',
  username: '',
  apiKey: '',
});
```

- [ ] **Step 2: 把新增账号提交逻辑提取成独立 handler，并在成功后关闭 modal**

```tsx
const handleCreateAccount = async () => {
  setCreatingAccount(true);

  try {
    await createFeverAccount(createDraft, { notifyOnError: false });
    setCreateDraft({ baseUrl: '', username: '', apiKey: '' });
    setCreateDialogOpen(false);
    await reloadAccounts();
  } finally {
    setCreatingAccount(false);
  }
};
```

- [ ] **Step 3: 将账号列表重排为摘要卡片，只保留精要信息和操作按钮**

```tsx
<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
  {accounts.map((account) => {
    const draft = autoSyncDrafts[account.id] ?? {
      autoSyncEnabled: account.autoSyncEnabled,
      autoSyncIntervalMinutes: account.autoSyncIntervalMinutes,
    };

    return (
      <article key={account.id} className="rounded-xl border border-border bg-card/70 p-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-foreground">{account.username}</p>
          <p className="truncate text-xs text-muted-foreground">{account.baseUrl}</p>
          <p className="text-xs text-muted-foreground">
            自动同步 · {draft.autoSyncEnabled ? `${draft.autoSyncIntervalMinutes} 分钟` : '已关闭'}
          </p>
        </div>
      </article>
    );
  })}
</div>
```

- [ ] **Step 4: 为新增账号接入 `Dialog` modal**

```tsx
<Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
  <DialogContent closeLabel="关闭添加 Fever 账号" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
    <DialogHeader>
      <DialogTitle>添加 Fever 账号</DialogTitle>
      <DialogDescription>填写连接信息后即可把远端订阅同步到本地。</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

- [ ] **Step 5: 为编辑自动同步接入独立 `Dialog` modal**

```tsx
<Dialog open={Boolean(editingAccount)} onOpenChange={(open) => {
  if (!open && !savingAutoSyncAccountId) {
    setEditAccountId(null);
  }
}}>
  <DialogContent closeLabel="关闭编辑 Fever 账号" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
    <DialogHeader>
      <DialogTitle>编辑 Fever 账号</DialogTitle>
      <DialogDescription>这里只调整自动同步策略，不修改远端账号凭据。</DialogDescription>
    </DialogHeader>
  </DialogContent>
</Dialog>
```

- [ ] **Step 6: 给关键状态流补简短中文注释**

```tsx
// 新增账号使用独立 modal，避免主面板长期占据大块表单空间。
// 编辑只允许调整可持久化的自动同步配置，保持前后端契约稳定。
// 列表刷新后重建本地草稿，确保卡片摘要与编辑表单都回显最新服务端结果。
```

- [ ] **Step 7: 运行定向测试，确认重构通过**

Run: `pnpm test:unit -- --run src/test/features/settings/feverAccountSettings.test.tsx`
Expected: PASS

### Task 3: 跑前端基线验证并收尾

**Files:**

- Test: `src/test/features/settings/feverAccountSettings.test.tsx`
- Test: project verification commands

- [ ] **Step 1: 运行类型检查**

Run: `pnpm type-check`
Expected: PASS

- [ ] **Step 2: 运行 lint**

Run: `pnpm lint`
Expected: PASS

- [ ] **Step 3: 如改动影响设置中心整体交互，补跑一次前端单测总入口**

Run: `pnpm test:unit`
Expected: PASS
