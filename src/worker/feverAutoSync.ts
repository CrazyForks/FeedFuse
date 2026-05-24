import type { Pool } from 'pg';
import {
  listEnabledFeverAccountsForAutoSync,
  markFeverAccountSyncAttempted,
  type FeverAccountRow,
} from '@/server/domains/fever/repositories/feverAccountsRepo';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_FEVER_SYNC } from '@/server/infra/queue/jobs';
import { enqueueWithResult } from '@/server/infra/queue/queue';

function resolveBaselineTimestamp(account: FeverAccountRow): number {
  const baseline =
    account.lastSyncAttemptAt
    ?? account.lastSyncAt
    ?? account.createdAt;
  const timestamp = new Date(baseline).getTime();
  return Number.isNaN(timestamp) ? Number.NEGATIVE_INFINITY : timestamp;
}

export function selectFeverAccountsForAutoSync(
  accounts: FeverAccountRow[],
  now: Date,
): FeverAccountRow[] {
  const nowMs = now.getTime();
  return accounts.filter((account) => {
    if (!account.enabled || !account.autoSyncEnabled) {
      return false;
    }

    const baselineMs = resolveBaselineTimestamp(account);
    return nowMs - baselineMs >= account.autoSyncIntervalMinutes * 60_000;
  });
}

export async function runFeverAutoSyncWorker(input: {
  pool: Pool;
  now?: Date;
}): Promise<{ enqueued: number }> {
  const now = input.now ?? new Date();
  const accounts = await listEnabledFeverAccountsForAutoSync(input.pool);
  const dueAccounts = selectFeverAccountsForAutoSync(accounts, now);
  let enqueued = 0;

  for (const account of dueAccounts) {
    const result = await enqueueWithResult(
      JOB_FEVER_SYNC,
      { accountId: account.id },
      getQueueSendOptions(JOB_FEVER_SYNC, { accountId: account.id }),
    );

    if (result.status !== 'enqueued') {
      continue;
    }

    // 记录最近一次调度尝试，避免分钟级扫描反复命中同一账号。
    await markFeverAccountSyncAttempted(input.pool, {
      accountId: account.id,
      attemptedAt: now.toISOString(),
    });
    enqueued += 1;
  }

  return { enqueued };
}
