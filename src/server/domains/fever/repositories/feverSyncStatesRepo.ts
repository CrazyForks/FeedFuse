import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface FeverSyncStateRow {
  feverAccountId: string;
  lastIncrementalItemId: string | null;
  lastIncrementalSyncedAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

const FEVER_SYNC_STATE_COLUMNS = `
  fever_account_id as "feverAccountId",
  last_incremental_item_id as "lastIncrementalItemId",
  last_incremental_synced_at as "lastIncrementalSyncedAt",
  last_full_sync_at as "lastFullSyncAt",
  last_error as "lastError",
  updated_at as "updatedAt"
`;

export async function getFeverSyncStateByAccountId(
  db: DbClient,
  accountId: string,
): Promise<FeverSyncStateRow | null> {
  const { rows } = await db.query<FeverSyncStateRow>(
    `
      select ${FEVER_SYNC_STATE_COLUMNS}
      from fever_sync_states
      where fever_account_id = $1
      limit 1
    `,
    [accountId],
  );

  return rows[0] ?? null;
}

export async function upsertFeverSyncState(
  db: DbClient,
  input: {
    accountId: string;
    lastIncrementalItemId?: string | null;
    lastIncrementalSyncedAt?: string | null;
    lastFullSyncAt?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  await db.query(
    `
      insert into fever_sync_states(
        fever_account_id,
        last_incremental_item_id,
        last_incremental_synced_at,
        last_full_sync_at,
        last_error,
        updated_at
      )
      values ($1, $2, $3::timestamptz, $4::timestamptz, $5, now())
      on conflict (fever_account_id)
      do update set
        last_incremental_item_id = coalesce(excluded.last_incremental_item_id, fever_sync_states.last_incremental_item_id),
        last_incremental_synced_at = coalesce(excluded.last_incremental_synced_at, fever_sync_states.last_incremental_synced_at),
        last_full_sync_at = coalesce(excluded.last_full_sync_at, fever_sync_states.last_full_sync_at),
        last_error = excluded.last_error,
        updated_at = now()
    `,
    [
      input.accountId,
      input.lastIncrementalItemId ?? null,
      input.lastIncrementalSyncedAt ?? null,
      input.lastFullSyncAt ?? null,
      input.lastError ?? null,
    ],
  );
}
