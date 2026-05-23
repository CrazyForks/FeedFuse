import type { Pool } from 'pg';
import { syncFeverAccount } from '@/server/domains/fever/services/feverSyncService';
import { createClientForAccount } from '@/server/domains/fever/services/feverWritebackService';

export async function runFeverSyncWorker(input: {
  pool: Pool;
  data: { accountId: string; runId?: string | null; feedIds?: string[] };
}) {
  const client = await createClientForAccount(input.pool, input.data.accountId);
  await syncFeverAccount(input.pool, {
    accountId: input.data.accountId,
    client,
  });
}
