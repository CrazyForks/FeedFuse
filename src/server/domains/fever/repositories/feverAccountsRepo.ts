import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface FeverAccountRow {
  id: string;
  baseUrl: string;
  username: string;
  apiKey: string;
  enabled: boolean;
  lastSyncAt: string | null;
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
      returning
        id,
        base_url as "baseUrl",
        username,
        api_key as "apiKey",
        enabled,
        last_sync_at as "lastSyncAt",
        last_error as "lastError"
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
      select
        id,
        base_url as "baseUrl",
        username,
        api_key as "apiKey",
        enabled,
        last_sync_at as "lastSyncAt",
        last_error as "lastError"
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
      select
        id,
        base_url as "baseUrl",
        username,
        api_key as "apiKey",
        enabled,
        last_sync_at as "lastSyncAt",
        last_error as "lastError"
      from fever_accounts
      order by created_at asc, id asc
    `,
  );
  return rows;
}

export async function updateFeverAccountSyncState(
  db: DbClient,
  input: { accountId: string; lastError?: string | null; syncedAt?: string | null },
): Promise<void> {
  await db.query(
    `
      update fever_accounts
      set
        last_sync_at = coalesce($2::timestamptz, last_sync_at),
        last_error = $3,
        updated_at = now()
      where id = $1
    `,
    [input.accountId, input.syncedAt ?? null, input.lastError ?? null],
  );
}
