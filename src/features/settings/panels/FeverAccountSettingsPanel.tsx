'use client';

import { useEffect, useState } from 'react';
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
import {
  runImmediateFailure,
  runImmediateSuccess,
} from '../../notifications/userOperationNotifier';

export default function FeverAccountSettingsPanel() {
  const baseUrlInputId = 'fever-account-base-url';
  const usernameInputId = 'fever-account-username';
  const apiKeyInputId = 'fever-account-api-key';
  const [accounts, setAccounts] = useState<FeverAccountDto[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [savingAutoSyncAccountId, setSavingAutoSyncAccountId] = useState<string | null>(null);
  const [deleteAccountId, setDeleteAccountId] = useState<string | null>(null);
  const [deletingAccountId, setDeletingAccountId] = useState<string | null>(null);
  const [autoSyncDrafts, setAutoSyncDrafts] = useState<
    Record<string, { autoSyncEnabled: boolean; autoSyncIntervalMinutes: number }>
  >({});

  const reloadAccounts = async () => {
    const nextAccounts = await listFeverAccounts({ notifyOnError: false });
    setAccounts(nextAccounts);
    setAutoSyncDrafts((currentDrafts) => {
      const nextDrafts: Record<string, { autoSyncEnabled: boolean; autoSyncIntervalMinutes: number }> = {};

      // 列表刷新后同步重建每个账号的本地草稿，避免保存后界面仍显示旧值。
      for (const account of nextAccounts) {
        nextDrafts[account.id] = currentDrafts[account.id] ?? {
          autoSyncEnabled: account.autoSyncEnabled,
          autoSyncIntervalMinutes: account.autoSyncIntervalMinutes,
        };
      }

      return nextDrafts;
    });
  };

  useEffect(() => {
    // 面板打开后立即回填远端已保存账号，避免刷新后列表丢失回显。
    void reloadAccounts();
  }, []);

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
    const draft = autoSyncDrafts[account.id] ?? {
      autoSyncEnabled: account.autoSyncEnabled,
      autoSyncIntervalMinutes: account.autoSyncIntervalMinutes,
    };
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

  const activeDeleteAccount =
    deleteAccountId ? accounts.find((account) => account.id === deleteAccountId) ?? null : null;

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
      <section className="space-y-4 rounded-lg border border-border bg-background p-4">
        <div className="space-y-1">
          <h3 className="text-sm font-medium text-foreground">Fever 账号</h3>
          <p className="text-xs text-muted-foreground">添加远端阅读器账号并触发同步。</p>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor={baseUrlInputId}>Base URL</Label>
            <Input id={baseUrlInputId} value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={usernameInputId}>Username</Label>
            <Input id={usernameInputId} value={username} onChange={(event) => setUsername(event.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={apiKeyInputId}>API Key</Label>
            <Input id={apiKeyInputId} value={apiKey} onChange={(event) => setApiKey(event.target.value)} />
          </div>
        </div>

        <Button
          type="button"
          onClick={() => {
            void (async () => {
              await createFeverAccount(
                { baseUrl, username, apiKey },
                { notifyOnError: false },
              );
              setApiKey('');
              await reloadAccounts();
            })();
          }}
        >
          添加 Fever 账号
        </Button>

        <div className="space-y-2">
          {accounts.map((account) => (
            <div key={account.id} className="space-y-3 rounded-md border border-border px-3 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{account.username}</p>
                  <p className="text-xs text-muted-foreground">{account.baseUrl}</p>
                  {account.lastSyncAt ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      上次同步：{formatSyncTime(account.lastSyncAt)}
                    </p>
                  ) : null}
                  {account.lastError ? (
                    <p className="mt-1 text-xs text-destructive">{account.lastError}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    type="button"
                    size="compact"
                    variant="outline"
                    onClick={() => {
                      setDeleteAccountId(account.id);
                    }}
                  >
                    删除账号
                  </Button>
                  <Button
                    type="button"
                    size="compact"
                    disabled={syncingAccountId === account.id}
                    onClick={() => {
                      void handleSyncAccount(account.id);
                    }}
                  >
                    {syncingAccountId === account.id ? '同步中…' : '立即同步'}
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 rounded-md bg-muted/30 p-3 md:grid-cols-[1fr_160px_auto] md:items-end">
                <div className="space-y-1">
                  <p className="text-sm font-medium">后台定时同步</p>
                  <p className="text-xs text-muted-foreground">worker 会按配置间隔自动入队该账号的同步任务。</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`fever-auto-sync-interval-${account.id}`}>自动同步间隔（分钟）</Label>
                  <Input
                    id={`fever-auto-sync-interval-${account.id}`}
                    aria-label="自动同步间隔（分钟）"
                    type="number"
                    min={5}
                    max={1440}
                    step={5}
                    value={String(
                      autoSyncDrafts[account.id]?.autoSyncIntervalMinutes
                      ?? account.autoSyncIntervalMinutes,
                    )}
                    onChange={(event) => {
                      updateAccountDraft(account.id, {
                        autoSyncIntervalMinutes: Number(event.target.value) || 5,
                      });
                    }}
                  />
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <div className="flex items-center gap-2">
                    <Switch
                      aria-label={`启用 ${account.username} 自动同步`}
                      checked={autoSyncDrafts[account.id]?.autoSyncEnabled ?? account.autoSyncEnabled}
                      onCheckedChange={(checked) => {
                        updateAccountDraft(account.id, { autoSyncEnabled: checked });
                      }}
                    />
                    <span className="text-xs text-muted-foreground">启用自动同步</span>
                  </div>
                  <Button
                    type="button"
                    size="compact"
                    variant="outline"
                    disabled={savingAutoSyncAccountId === account.id}
                    onClick={() => {
                      void handleSaveAutoSync(account);
                    }}
                  >
                    {savingAutoSyncAccountId === account.id ? '保存中…' : '保存自动同步'}
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

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
