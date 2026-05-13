import type { Pool, PoolClient } from 'pg';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { deleteExpiredSystemLogs } from '@/server/domains/settings/repositories/systemLogsRepo';

type Queryable = Pool | PoolClient;

export async function runSystemLogCleanup(input: {
  pool: Queryable;
}): Promise<number> {
  const logging = normalizePersistedSettings(await getUiSettings(input.pool)).logging;
  return deleteExpiredSystemLogs(input.pool, {
    retentionDays: logging.retentionDays,
  });
}
