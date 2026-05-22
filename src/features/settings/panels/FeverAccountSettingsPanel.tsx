'use client';

import { startTransition, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createFeverAccount,
  listFeverAccounts,
  syncFeverAccountNow,
  type FeverAccountDto,
} from '@/lib/api/apiClient';

export default function FeverAccountSettingsPanel() {
  const baseUrlInputId = 'fever-account-base-url';
  const usernameInputId = 'fever-account-username';
  const apiKeyInputId = 'fever-account-api-key';
  const [accounts, setAccounts] = useState<FeverAccountDto[]>([]);
  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [apiKey, setApiKey] = useState('');

  const reloadAccounts = async () => {
    const nextAccounts = await listFeverAccounts({ notifyOnError: false });
    startTransition(() => {
      setAccounts(nextAccounts);
    });
  };

  return (
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
          <div
            key={account.id}
            className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2"
          >
            <div>
              <p className="text-sm font-medium">{account.username}</p>
              <p className="text-xs text-muted-foreground">{account.baseUrl}</p>
            </div>
            <Button
              type="button"
              size="compact"
              onClick={() => {
                void syncFeverAccountNow(account.id, { notifyOnError: false });
              }}
            >
              立即同步
            </Button>
          </div>
        ))}
      </div>
    </section>
  );
}
