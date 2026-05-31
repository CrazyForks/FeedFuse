import type { Pool, PoolClient } from 'pg';
import type { LoggingSettings, SystemLogCategory } from '@/types';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import {
  insertSystemLog,
  type SystemLogLevel,
} from '@/server/domains/settings/repositories/systemLogsRepo';

type Queryable = Pool | PoolClient;

const logLevelWeight: Record<SystemLogLevel, number> = {
  info: 1,
  warning: 2,
  error: 3,
};

function meetsMinimumLevel(minLevel: SystemLogLevel, level: SystemLogLevel) {
  return logLevelWeight[level] >= logLevelWeight[minLevel];
}

export interface WriteSystemLogInput {
  userId?: string | null;
  level: SystemLogLevel;
  category: SystemLogCategory;
  message: string;
  details?: string | null;
  source: string;
  context?: Record<string, unknown>;
}

export async function writeSystemLog(
  pool: Queryable,
  input: WriteSystemLogInput,
  options?: { forceWrite?: boolean; loggingOverride?: LoggingSettings },
): Promise<{ written: boolean }> {
  // 日志设置也按用户读取，避免多账户共用开关和等级。
  const logging =
    options?.loggingOverride ??
    normalizePersistedSettings(await getUiSettings(pool, input.userId ?? undefined)).logging;

  if (!logging.enabled && !options?.forceWrite) {
    return { written: false };
  }

  if (!options?.forceWrite && !meetsMinimumLevel(logging.minLevel, input.level)) {
    return { written: false };
  }

  await insertSystemLog(pool, {
    ...input,
    userId: input.userId ?? null,
    details: input.details ?? null,
    context: input.context ?? {},
  });

  return { written: true };
}
