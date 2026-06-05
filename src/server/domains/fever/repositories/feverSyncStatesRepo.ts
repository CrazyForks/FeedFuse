import type { Pool, PoolClient } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

type DbClient = Pool | PoolClient;

export interface FeverSyncStateRow {
  userId: string;
  feverAccountId: string;
  lastIncrementalItemId: string | null;
  lastIncrementalSyncedAt: string | null;
  lastFullSyncAt: string | null;
  lastError: string | null;
  updatedAt: string;
}

const FEVER_SYNC_STATE_COLUMNS = `
  user_id::text as "userId",
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
  userId?: string | null,
): Promise<FeverSyncStateRow | null> {
  const scopedUserId = normalizeUserId(userId);
  const { rows } = await db.query<FeverSyncStateRow>(
    `
      select ${FEVER_SYNC_STATE_COLUMNS}
      from fever_sync_states
      where fever_account_id = $1 and user_id = $2
      limit 1
    `,
    [accountId, scopedUserId],
  );

  return rows[0] ?? null;
}

export async function upsertFeverSyncState(
  db: DbClient,
  input: {
    userId?: string | null;
    accountId: string;
    lastIncrementalItemId?: string | null;
    lastIncrementalSyncedAt?: string | null;
    lastFullSyncAt?: string | null;
    lastError?: string | null;
  },
): Promise<void> {
  const scopedUserId = normalizeUserId(input.userId);
  await db.query(
    `
      insert into fever_sync_states(
        user_id,
        fever_account_id,
        last_incremental_item_id,
        last_incremental_synced_at,
        last_full_sync_at,
        last_error,
        updated_at
      )
      values ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, now())
      on conflict (user_id, fever_account_id)
      do update set
        last_incremental_item_id = coalesce(excluded.last_incremental_item_id, fever_sync_states.last_incremental_item_id),
        last_incremental_synced_at = coalesce(excluded.last_incremental_synced_at, fever_sync_states.last_incremental_synced_at),
        last_full_sync_at = coalesce(excluded.last_full_sync_at, fever_sync_states.last_full_sync_at),
        last_error = excluded.last_error,
        updated_at = now()
    `,
    [
      scopedUserId,
      input.accountId,
      input.lastIncrementalItemId ?? null,
      input.lastIncrementalSyncedAt ?? null,
      input.lastFullSyncAt ?? null,
      input.lastError ?? null,
    ],
  );
}
