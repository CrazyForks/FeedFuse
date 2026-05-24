import type { PgBoss } from 'pg-boss';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_FEVER_SYNC } from '@/server/infra/queue/jobs';
import { markFeverAccountSyncAttempted } from '@/server/domains/fever/repositories/feverAccountsRepo';

export interface FeverRefreshAllTarget {
  accountId: string;
  feedIds: string[];
}

export async function enqueueFeverRefreshAllTargets(input: {
  boss: Pick<PgBoss, 'send'>;
  pool: Parameters<typeof markFeverAccountSyncAttempted>[0];
  runId?: string;
  now: Date;
  feverTargets: FeverRefreshAllTarget[];
  markFeverAccountSyncAttempted?: typeof markFeverAccountSyncAttempted;
}): Promise<number> {
  const markAttempt = input.markFeverAccountSyncAttempted ?? markFeverAccountSyncAttempted;
  let enqueued = 0;

  for (const target of input.feverTargets) {
    if (target.feedIds.length === 0) {
      continue;
    }

    const payload = {
      accountId: target.accountId,
      ...(input.runId ? { runId: input.runId } : {}),
      feedIds: target.feedIds,
    };
    const jobId = await input.boss.send(
      JOB_FEVER_SYNC,
      payload,
      getQueueSendOptions(JOB_FEVER_SYNC, payload),
    );
    if (!jobId) {
      continue;
    }

    // 全量刷新里的 Fever 账号也要记录最近一次尝试时间，但只能在真正入队后写入。
    await markAttempt(input.pool, {
      accountId: target.accountId,
      attemptedAt: input.now.toISOString(),
    });
    enqueued += 1;
  }

  return enqueued;
}
