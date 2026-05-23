import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

const FEVER_ACCOUNT_COLUMNS = `
  id,
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
  input: { baseUrl: string; username: string; apiKey: string; enabled?: boolean },
): Promise<FeverAccountRow> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      insert into fever_accounts(base_url, username, api_key, enabled)
      values ($1, $2, $3, $4)
      returning ${FEVER_ACCOUNT_COLUMNS}
    `,
    [input.baseUrl, input.username, input.apiKey, input.enabled ?? true],
  );
  return rows[0];
}

export async function getFeverAccountById(
  db: DbClient,
  id: string,
): Promise<FeverAccountRow | null> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where id = $1
      limit 1
    `,
    [id],
  );
  return rows[0] ?? null;
}

export async function listFeverAccounts(db: DbClient): Promise<FeverAccountRow[]> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      order by created_at asc, id asc
    `,
  );
  return rows;
}

export async function deleteFeverAccount(db: DbClient, id: string): Promise<boolean> {
  const result = await db.query(
    `
      delete from fever_accounts
      where id = $1
    `,
    [id],
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
    `,
    [
      input.accountId,
      input.syncedAt ?? null,
      input.lastError ?? null,
      input.attemptedAt ?? null,
    ],
  );
}

export async function markFeverAccountSyncAttempted(
  db: DbClient,
  input: { accountId: string; attemptedAt: string },
): Promise<void> {
  await db.query(
    `
      update fever_accounts
      set
        last_sync_attempt_at = $2::timestamptz,
        updated_at = now()
      where id = $1
    `,
    [input.accountId, input.attemptedAt],
  );
}

export async function updateFeverAccountAutoSyncSettings(
  db: DbClient,
  input: {
    accountId: string;
    autoSyncEnabled: boolean;
    autoSyncIntervalMinutes: number;
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
      returning ${FEVER_ACCOUNT_COLUMNS}
    `,
    [input.accountId, input.autoSyncEnabled, input.autoSyncIntervalMinutes],
  );

  return rows[0] ?? null;
}

export async function listEnabledFeverAccountsForAutoSync(
  db: DbClient,
): Promise<FeverAccountRow[]> {
  const { rows } = await db.query<FeverAccountRow>(
    `
      select ${FEVER_ACCOUNT_COLUMNS}
      from fever_accounts
      where enabled = true
        and auto_sync_enabled = true
      order by created_at asc, id asc
    `,
  );

  return rows;
}
