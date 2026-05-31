import type { Pool, PoolClient } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

type DbClient = Pool | PoolClient;

const FEVER_ACCOUNT_COLUMNS = `
  id,
  user_id::text as "userId",
  base_url as "baseUrl",
  username,
  api_key as "apiKey",
  enabled,
  auto_sync_enabled as "autoSyncEnabled",
  auto_sync_interval_minutes as "autoSyncIntervalMinutes",
  created_at as "createdAt",
  last_sync_at as "lastSyncAt",
  last_sync_attempt_at as "lastSyncAttemptAt",
  last_error as "lastError"
`;

export interface FeverAccountRow {
  id: string;
  userId: string;
  baseUrl: string;
  username: string;
  apiKey: string;
  enabled: boolean;
  autoSyncEnabled: boolean;
  autoSyncIntervalMinutes: number;
  createdAt: string;
  lastSyncAt: string | null;
  lastSyncAttemptAt: string | null;
  lastError: string | null;
}

export async function createFeverAccount(
  db: DbClient,
  input: {
    baseUrl: string;
    username: string;
    apiKey: string;
    enabled?: boolean;
    autoSyncIntervalMinutes?: number;
    userId?: string;
  },
): Promise<FeverAccountRow> {
  const userId = normalizeUserId(input.userId);
  const autoSyncIntervalMinutes = input.autoSyncIntervalMinutes ?? 30;
  const autoSyncEnabled = autoSyncIntervalMinutes > 0;

  const { rows } = await db.query<FeverAccountRow>(
    `
      insert into fever_accounts(
        user_id,
        base_url,
        username,
        api_key,
        enabled,
        auto_sync_enabled,
        auto_sync_interval_minutes
      )
      values ($1, $2, $3, $4, $5, $6, $7)
      returning ${FEVER_ACCOUNT_COLUMNS}
    `,
    [
      userId,
      input.baseUrl,
      input.username,
      input.apiKey,
      input.enabled ?? true,
      autoSyncEnabled,
      autoSyncIntervalMinutes,
    ],
  );
  return rows[0];
}

export async function getFeverAccountById(
  db: DbClient,
  id: string,
  userId?: string,
): Promise<FeverAccountRow | null> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where id = $1
        and user_id = $2
      limit 1
    `,
    [id, normalizeUserId(userId)],
  );
  return rows[0] ?? null;
}

export async function listFeverAccounts(db: DbClient, userId?: string): Promise<FeverAccountRow[]> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where user_id = $1
      order by created_at asc, id asc
    `,
    [normalizeUserId(userId)],
  );
  return rows;
}

export async function listEnabledFeverAccounts(db: DbClient, userId?: string): Promise<FeverAccountRow[]> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where user_id = $1
        and enabled = true
      order by created_at asc, id asc
    `,
    [normalizeUserId(userId)],
  );
  return rows;
}

export async function deleteFeverAccount(db: DbClient, id: string, userId?: string): Promise<boolean> {
  const result = await db.query(
    `
      delete from fever_accounts
      where id = $1
        and user_id = $2
    `,
    [id, normalizeUserId(userId)],
  );

  return (result.rowCount ?? 0) > 0;
}

export async function updateFeverAccountSyncState(
  db: DbClient,
  input: {
    accountId: string;
    lastError?: string | null;
    syncedAt?: string | null;
    attemptedAt?: string | null;
    userId?: string;
  },
): Promise<void> {
  await db.query(
    `
      update fever_accounts
      set
        last_sync_at = coalesce($2::timestamptz, last_sync_at),
        last_error = $3,
        last_sync_attempt_at = coalesce($4::timestamptz, last_sync_attempt_at),
        updated_at = now()
      where id = $1
        and user_id = $5
    `,
    [
      input.accountId,
      input.syncedAt ?? null,
      input.lastError ?? null,
      input.attemptedAt ?? null,
      normalizeUserId(input.userId),
    ],
  );
}

export async function markFeverAccountSyncAttempted(
  db: DbClient,
  input: { accountId: string; attemptedAt: string; userId?: string },
): Promise<void> {
  await db.query(
    `
      update fever_accounts
      set
        last_sync_attempt_at = $2::timestamptz,
        updated_at = now()
      where id = $1
        and user_id = $3
    `,
    [input.accountId, input.attemptedAt, normalizeUserId(input.userId)],
  );
}

export async function updateFeverAccountAutoSyncSettings(
  db: DbClient,
  input: {
    accountId: string;
    autoSyncEnabled: boolean;
    autoSyncIntervalMinutes: number;
    userId?: string;
  },
): Promise<FeverAccountRow | null> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      update fever_accounts
      set
        auto_sync_enabled = $2,
        auto_sync_interval_minutes = $3,
        updated_at = now()
      where id = $1
        and user_id = $4
      returning ${FEVER_ACCOUNT_COLUMNS}
    `,
    [
      input.accountId,
      input.autoSyncEnabled,
      input.autoSyncIntervalMinutes,
      normalizeUserId(input.userId),
    ],
  );

  return rows[0] ?? null;
}

export async function updateFeverAccount(
  db: DbClient,
  input: {
    accountId: string;
    baseUrl: string;
    username: string;
    apiKey?: string;
    enabled: boolean;
    autoSyncIntervalMinutes: number;
    userId?: string;
  },
): Promise<FeverAccountRow | null> {
  const autoSyncEnabled = input.autoSyncIntervalMinutes > 0;

  const { rows } = await db.query<FeverAccountRow>(
    `
      update fever_accounts
      set
        base_url = $2,
        username = $3,
        api_key = coalesce(nullif($4, ''), api_key),
        enabled = $5,
        auto_sync_enabled = $6,
        auto_sync_interval_minutes = $7,
        updated_at = now()
      where id = $1
        and user_id = $8
      returning ${FEVER_ACCOUNT_COLUMNS}
    `,
    [
      input.accountId,
      input.baseUrl,
      input.username,
      input.apiKey ?? '',
      input.enabled,
      autoSyncEnabled,
      input.autoSyncIntervalMinutes,
      normalizeUserId(input.userId),
    ],
  );

  return rows[0] ?? null;
}

export async function listEnabledFeverAccountsForAutoSync(
  db: DbClient,
  userId?: string,
): Promise<FeverAccountRow[]> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where user_id = $1
        and enabled = true
        and auto_sync_enabled = true
      order by created_at asc, id asc
    `,
    [normalizeUserId(userId)],
  );

  return rows;
}
