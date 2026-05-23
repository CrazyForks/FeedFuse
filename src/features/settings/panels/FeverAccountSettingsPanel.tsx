'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  createFeverAccount,
  deleteFeverAccount,
  listFeverAccounts,
  syncFeverAccountNow,
  type FeverAccountDto,
  updateFeverAccountAutoSyncSettings,
} from '@/lib/api/apiClient';
import { DIALOG_FORM_CONTENT_CLASS_NAME } from '@/lib/ui/designSystem';
import {
  runImmediateFailure,
  runImmediateSuccess,
} from '../../notifications/userOperationNotifier';

export default function FeverAccountSettingsPanel() {
  const baseUrlInputId = 'fever-account-base-url';
  const usernameInputId = 'fever-account-username';
  const apiKeyInputId = 'fever-account-api-key';
  const [accounts, setAccounts] = useState<FeverAccountDto[]>([]);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [createDraft, setCreateDraft] = useState({
    baseUrl: '',
    username: '',
    apiKey: '',
  });
  const [creatingAccount, setCreatingAccount] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [savingAutoSyncAccountId, setSavingAutoSyncAccountId] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [autoSyncDrafts, setAutoSyncDrafts] = useState<
    Record<string, { autoSyncEnabled: boolean; autoSyncIntervalMinutes: number }>
  >({});

  const buildAutoSyncDraft = (account: FeverAccountDto) => ({
    autoSyncEnabled: account.autoSyncEnabled,
    autoSyncIntervalMinutes: account.autoSyncIntervalMinutes,
  });

  const updateCreateDraft = (patch: Partial<typeof createDraft>) => {
    setCreateDraft((current) => ({
      ...current,
      ...patch,
    }));
  };

  const reloadAccounts = useCallback(async () => {
    const nextAccounts = await listFeverAccounts({ notifyOnError: false });
    setAccounts(nextAccounts);
    setAutoSyncDrafts((currentDrafts) => {
      const nextDrafts: Record<string, { autoSyncEnabled: boolean; autoSyncIntervalMinutes: number }> = {};

      // 列表刷新后同步重建每个账号的本地草稿，避免保存后界面仍显示旧值。
      for (const account of nextAccounts) {
        nextDrafts[account.id] = currentDrafts[account.id] ?? buildAutoSyncDraft(account);
      }

      return nextDrafts;
    });
  }, []);

  useEffect(() => {
    // 面板打开后立即回填远端已保存账号，避免刷新后列表丢失回显。
    void reloadAccounts();
  }, [reloadAccounts]);

  const formatSyncTime = (value: string): string => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('zh-CN', {
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const waitForSyncResult = async (
    accountId: string,
    previousState: { lastSyncAt: string | null; lastError: string | null },
  ) => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const nextAccounts = await listFeverAccounts({ notifyOnError: false });
      setAccounts(nextAccounts);

      const nextAccount = nextAccounts.find((account) => account.id === accountId);
      const hasNewError = nextAccount?.lastError && nextAccount.lastError !== previousState.lastError;
      const hasNewSyncTime =
        nextAccount?.lastSyncAt && nextAccount.lastSyncAt !== previousState.lastSyncAt;
      if (hasNewError || hasNewSyncTime) {
        return nextAccount;
      }

      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return null;
  };

  const handleSyncAccount = async (accountId: string) => {
    if (syncingAccountId) {
      return;
    }

    const currentAccount = accounts.find((account) => account.id === accountId) ?? null;
    setSyncingAccountId(accountId);

    try {
      const result = await syncFeverAccountNow(accountId, { notifyOnError: false });
      if (result.queued) {
        await waitForSyncResult(accountId, {
          lastSyncAt: currentAccount?.lastSyncAt ?? null,
          lastError: currentAccount?.lastError ?? null,
        });
        runImmediateSuccess({ actionKey: 'fever.sync' });
        return;
      }

      if (result.reason === 'already_enqueued') {
        await waitForSyncResult(accountId, {
          lastSyncAt: currentAccount?.lastSyncAt ?? null,
          lastError: currentAccount?.lastError ?? null,
        });
        runImmediateSuccess({
          actionKey: 'fever.sync',
          context: { outcome: 'already_enqueued' },
        });
        return;
      }

      runImmediateFailure({
        actionKey: 'fever.sync',
        err: '暂时无法加入同步队列，请稍后重试',
      });
    } catch (err) {
      runImmediateFailure({
        actionKey: 'fever.sync',
        err,
      });
    } finally {
      setSyncingAccountId(null);
    }
  };

  const updateAccountDraft = (
    accountId: string,
    patch: Partial<{ autoSyncEnabled: boolean; autoSyncIntervalMinutes: number }>,
  ) => {
    setAutoSyncDrafts((currentDrafts) => {
      const currentDraft = currentDrafts[accountId]
        ?? {
          autoSyncEnabled: true,
          autoSyncIntervalMinutes: 30,
        };

      return {
        ...currentDrafts,
        [accountId]: {
          ...currentDraft,
          ...patch,
        },
      };
    });
  };

  const handleSaveAutoSync = async (account: FeverAccountDto) => {
    const draft = autoSyncDrafts[account.id] ?? buildAutoSyncDraft(account);
    const normalizedInterval = Math.max(5, Math.min(1440, Math.round(draft.autoSyncIntervalMinutes)));

    setSavingAutoSyncAccountId(account.id);

    try {
      const updated = await updateFeverAccountAutoSyncSettings(
        {
          id: account.id,
          autoSyncEnabled: draft.autoSyncEnabled,
          autoSyncIntervalMinutes: normalizedInterval,
        },
        { notifyOnError: false },
      );

      setAccounts((currentAccounts) => currentAccounts.map((currentAccount) => (
        currentAccount.id === updated.id ? updated : currentAccount
      )));
      setAutoSyncDrafts((currentDrafts) => ({
        ...currentDrafts,
        [account.id]: {
          autoSyncEnabled: updated.autoSyncEnabled,
          autoSyncIntervalMinutes: updated.autoSyncIntervalMinutes,
        },
      }));
      setEditAccountId(null);
      runImmediateSuccess({
        actionKey: 'fever.sync',
        context: { outcome: 'settings_saved' },
      });
    } catch (err) {
      runImmediateFailure({
        actionKey: 'fever.sync',
        err,
      });
    } finally {
      setSavingAutoSyncAccountId(null);
    }
  };

  const handleCreateAccount = async () => {
    setCreatingAccount(true);

    try {
      await createFeverAccount(createDraft, { notifyOnError: false });
      // 新增账号使用独立 modal，避免主面板长期占据大块表单空间。
      setCreateDraft({
        baseUrl: '',
        username: '',
        apiKey: '',
      });
      setCreateDialogOpen(false);
      await reloadAccounts();
    } catch (err) {
      runImmediateFailure({
        actionKey: 'fever.sync',
        err,
      });
    } finally {
      setCreatingAccount(false);
    }
  };

  const activeDeleteAccount =
    deleteAccountId ? accounts.find((account) => account.id === deleteAccountId) ?? null : null;
  const editingAccount =
    editAccountId ? accounts.find((account) => account.id === editAccountId) ?? null : null;

  const handleDeleteAccount = async () => {
    if (!deleteAccountId) {
      return;
    }

    setDeletingAccountId(deleteAccountId);

    try {
      await deleteFeverAccount(deleteAccountId, { notifyOnError: false });
      await reloadAccounts();
      setDeleteAccountId(null);
      runImmediateSuccess({
        actionKey: 'fever.sync',
        context: { outcome: 'deleted' },
      });
    } catch (err) {
      runImmediateFailure({
        actionKey: 'fever.sync',
        err,
      });
    } finally {
      setDeletingAccountId(null);
    }
  };

  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-background p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-foreground">Fever 账号</h3>
            <p className="text-xs text-muted-foreground">统一管理远端账号与同步状态。</p>
          </div>
          <Button
            type="button"
            size="compact"
            onClick={() => {
              setCreateDialogOpen(true);
            }}
          >
            添加 Fever 账号
          </Button>
        </div>

        <div className="grid gap-2.5">
          {accounts.map((account) => (
            <article
              key={account.id}
              className="w-full rounded-xl border border-border/80 bg-card/70 px-3 py-2.5 shadow-sm"
            >
              <div className="flex items-stretch justify-between gap-3">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    <p className="text-sm font-semibold text-foreground">{account.username}</p>
                    <p className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">{account.baseUrl}</p>
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/35 px-2 py-1">
                      <span className="text-muted-foreground">自动同步</span>
                      <span className="font-medium text-foreground">
                        {account.autoSyncEnabled ? `${account.autoSyncIntervalMinutes} 分钟` : '已关闭'}
                      </span>
                    </div>
                    <div className="inline-flex items-center gap-1.5 rounded-md bg-muted/35 px-2 py-1">
                      <span className="text-muted-foreground">上次同步</span>
                      <span className="text-foreground">
                        {account.lastSyncAt ? formatSyncTime(account.lastSyncAt) : '尚未同步'}
                      </span>
                    </div>
                  </div>

                  {account.lastError ? (
                    <div className="inline-flex max-w-full items-center rounded-md border border-destructive/20 bg-destructive/8 px-2 py-1 text-[11px] text-destructive">
                      {account.lastError}
                    </div>
                  ) : null}
                </div>

                <div className="flex shrink-0 items-end">
                  <div className="flex flex-wrap justify-end gap-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      aria-label={`编辑 ${account.username}`}
                      onClick={() => {
                        // 编辑只允许调整可持久化的自动同步配置，保持前后端契约稳定。
                        setEditAccountId(account.id);
                      }}
                    >
                      编辑
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setDeleteAccountId(account.id);
                      }}
                    >
                      删除账号
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={syncingAccountId === account.id}
                      onClick={() => {
                        void handleSyncAccount(account.id);
                      }}
                    >
                      {syncingAccountId === account.id ? '同步中…' : '立即同步'}
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          ))}

          {accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border/80 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">
              暂无 Fever 账号，点击右上角按钮添加。
            </div>
          ) : null}
        </div>
      </section>

      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!creatingAccount) {
            setCreateDialogOpen(open);
          }
        }}
      >
        <DialogContent
          closeLabel="关闭添加 Fever 账号"
          className={DIALOG_FORM_CONTENT_CLASS_NAME}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
          }}
        >
          <DialogHeader>
            <DialogTitle>添加 Fever 账号</DialogTitle>
            <DialogDescription>填写连接信息后即可把远端订阅同步到本地。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="space-y-2">
              <Label htmlFor={baseUrlInputId}>Base URL</Label>
              <Input
                id={baseUrlInputId}
                type="url"
                value={createDraft.baseUrl}
                onChange={(event) => {
                  updateCreateDraft({ baseUrl: event.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={usernameInputId}>Username</Label>
              <Input
                id={usernameInputId}
                value={createDraft.username}
                onChange={(event) => {
                  updateCreateDraft({ username: event.target.value });
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={apiKeyInputId}>API Key</Label>
              <Input
                id={apiKeyInputId}
                value={createDraft.apiKey}
                onChange={(event) => {
                  updateCreateDraft({ apiKey: event.target.value });
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setCreateDialogOpen(false);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={creatingAccount}
              onClick={() => {
                void handleCreateAccount();
              }}
            >
              {creatingAccount ? '保存中…' : '保存账号'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingAccount)}
        onOpenChange={(open) => {
          if (!open && !savingAutoSyncAccountId) {
            setEditAccountId(null);
          }
        }}
      >
        <DialogContent closeLabel="关闭编辑 Fever 账号" className={DIALOG_FORM_CONTENT_CLASS_NAME}>
          <DialogHeader>
            <DialogTitle>编辑 Fever 账号</DialogTitle>
            <DialogDescription>这里只调整自动同步策略，不修改远端账号凭据。</DialogDescription>
          </DialogHeader>
          {editingAccount ? (
            <div className="grid gap-4">
              <div className="rounded-xl border border-border/70 bg-muted/25 px-4 py-3">
                <p className="text-sm font-medium text-foreground">{editingAccount.username}</p>
                <p className="mt-1 text-xs text-muted-foreground">{editingAccount.baseUrl}</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor={`fever-auto-sync-interval-${editingAccount.id}`}>自动同步间隔（分钟）</Label>
                <Input
                  id={`fever-auto-sync-interval-${editingAccount.id}`}
                  aria-label="自动同步间隔（分钟）"
                  type="number"
                  min={5}
                  max={1440}
                  step={5}
                  value={String(
                    autoSyncDrafts[editingAccount.id]?.autoSyncIntervalMinutes
                    ?? buildAutoSyncDraft(editingAccount).autoSyncIntervalMinutes,
                  )}
                  onChange={(event) => {
                    updateAccountDraft(editingAccount.id, {
                      autoSyncIntervalMinutes: Number(event.target.value) || 5,
                    });
                  }}
                />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3">
                <div className="space-y-1">
                  <p className="text-sm font-medium text-foreground">启用自动同步</p>
                  <p className="text-xs text-muted-foreground">worker 会按间隔自动入队同步任务。</p>
                </div>
                <Switch
                  aria-label={`启用 ${editingAccount.username} 自动同步`}
                  checked={autoSyncDrafts[editingAccount.id]?.autoSyncEnabled ?? editingAccount.autoSyncEnabled}
                  onCheckedChange={(checked) => {
                    updateAccountDraft(editingAccount.id, { autoSyncEnabled: checked });
                  }}
                />
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditAccountId(null);
              }}
            >
              取消
            </Button>
            <Button
              type="button"
              disabled={!editingAccount || savingAutoSyncAccountId === editingAccount.id}
              onClick={() => {
                if (editingAccount) {
                  void handleSaveAutoSync(editingAccount);
                }
              }}
            >
              {savingAutoSyncAccountId === editingAccount?.id ? '保存中…' : '保存自动同步'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={Boolean(deleteAccountId)}
        onOpenChange={(open) => {
          if (!open && !deletingAccountId) {
            setDeleteAccountId(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除 Fever 账号</AlertDialogTitle>
            <AlertDialogDescription className="break-words">
              {activeDeleteAccount
                ? `确定删除 Fever 账号「${activeDeleteAccount.username}」？`
                : '确定删除这个 Fever 账号？'}
              删除后将移除该账号配置，且无法恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={Boolean(deletingAccountId)}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/92"
              onClick={(event) => {
                event.preventDefault();
                void handleDeleteAccount();
              }}
            >
              {deletingAccountId ? '删除中…' : '确认删除'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
