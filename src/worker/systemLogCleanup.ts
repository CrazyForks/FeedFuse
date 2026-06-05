import type { Pool, PoolClient } from 'pg';
import { defaultPersistedSettings, normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { listUsers } from '@/server/domains/auth/repositories/usersRepo';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { deleteExpiredSystemLogs } from '@/server/domains/settings/repositories/systemLogsRepo';

type Queryable = Pool | PoolClient;

type SystemLogCleanupDeps = {
  listUsers: typeof listUsers;
  getUiSettings: typeof getUiSettings;
  deleteExpiredSystemLogs: typeof deleteExpiredSystemLogs;
};

const defaultDeps: SystemLogCleanupDeps = {
  listUsers,
  getUiSettings,
  deleteExpiredSystemLogs,
};

export async function runSystemLogCleanup(input: {
  pool: Queryable;
  deps?: Partial<SystemLogCleanupDeps>;
}): Promise<number> {
  const deps = { ...defaultDeps, ...(input.deps ?? {}) };
  let deletedCount = 0;

  // 无归属日志使用产品默认保留期，避免错误套用某个用户的个人设置。
  deletedCount += await deps.deleteExpiredSystemLogs(input.pool, {
    retentionDays: defaultPersistedSettings.logging.retentionDays,
    userId: null,
  });

  const users = await deps.listUsers(input.pool);
  for (const user of users) {
    const logging = normalizePersistedSettings(
      await deps.getUiSettings(input.pool, user.id),
    ).logging;
    deletedCount += await deps.deleteExpiredSystemLogs(input.pool, {
      retentionDays: logging.retentionDays,
      userId: user.id,
    });
  }

  return deletedCount;
}
