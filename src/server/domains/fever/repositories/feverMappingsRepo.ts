import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export interface FeverFeedMappingRow {
  feverAccountId: string;
  feverFeedId: string;
  localFeedId: string;
  remoteGroupName: string | null;
  remoteTitle: string;
  remoteUrl: string;
  remoteFaviconUrl: string | null;
  isActive: boolean;
}

export interface FeverAccountFeedRow {
  feverAccountId: string;
  localFeedId: string;
}

export interface FeverItemMappingRow {
  feverAccountId: string;
  feverItemId: string;
  feverFeedId: string;
  localFeedId: string;
  localArticleId: string;
  remoteIsRead: boolean;
  remoteIsSaved: boolean;
  isActive: boolean;
}

export interface FeverUnreadItemMappingRow {
  feverAccountId: string;
  feverItemId: string;
  localArticleId: string;
}

export async function hasAnyFeverItemMappingByLocalArticleId(
  db: DbClient,
  localArticleId: string,
): Promise<boolean> {
  const { rows } = await db.query<{ exists: boolean }>(
    `
      select exists(
        select 1
        from fever_item_mappings
        where local_article_id = $1
      ) as "exists"
    `,
    [localArticleId],
  );
  return rows[0]?.exists ?? false;
}

export async function upsertFeverFeedMapping(
  db: DbClient,
  input: {
    accountId: string;
    feverFeedId: string;
    localFeedId: string;
    remoteTitle: string;
    remoteUrl: string;
    remoteGroupName: string | null;
    remoteFaviconUrl?: string | null;
  },
): Promise<void> {
  await db.query(
    `
      insert into fever_feed_mappings(
        fever_account_id,
        fever_feed_id,
        local_feed_id,
        remote_group_name,
        remote_title,
        remote_url,
        remote_favicon_url,
        is_active,
        last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, true, now())
      on conflict (fever_account_id, fever_feed_id)
      do update set
        local_feed_id = excluded.local_feed_id,
        remote_group_name = excluded.remote_group_name,
        remote_title = excluded.remote_title,
        remote_url = excluded.remote_url,
        remote_favicon_url = excluded.remote_favicon_url,
        is_active = true,
        last_seen_at = now()
    `,
    [
      input.accountId,
      input.feverFeedId,
      input.localFeedId,
      input.remoteGroupName,
      input.remoteTitle,
      input.remoteUrl,
      input.remoteFaviconUrl ?? null,
    ],
  );
}

export async function getFeverFeedMappingByRemoteFeedId(
  db: DbClient,
  input: { accountId: string; feverFeedId: string },
): Promise<FeverFeedMappingRow | null> {
  const { rows } = await db.query<FeverFeedMappingRow>(
    `
      select
        fever_account_id as "feverAccountId",
        fever_feed_id as "feverFeedId",
        local_feed_id as "localFeedId",
        remote_group_name as "remoteGroupName",
        remote_title as "remoteTitle",
        remote_url as "remoteUrl",
        remote_favicon_url as "remoteFaviconUrl",
        is_active as "isActive"
      from fever_feed_mappings
      where fever_account_id = $1
        and fever_feed_id = $2
      limit 1
    `,
    [input.accountId, input.feverFeedId],
  );
  return rows[0] ?? null;
}

export async function getFeverAccountByLocalFeedId(
  db: DbClient,
  localFeedId: string,
): Promise<FeverAccountFeedRow | null> {
  const { rows } = await db.query<FeverAccountFeedRow>(
    `
      select
        fever_feed_mappings.fever_account_id as "feverAccountId",
        fever_feed_mappings.local_feed_id as "localFeedId"
      from fever_feed_mappings
      join fever_accounts fa on fa.id = fever_feed_mappings.fever_account_id
      where fever_feed_mappings.local_feed_id = $1
        and is_active = true
        and fa.enabled = true
      limit 1
    `,
    [localFeedId],
  );
  return rows[0] ?? null;
}

export async function listLocalFeedIdsByFeverAccountId(
  db: DbClient,
  accountId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ localFeedId: string }>(
    `
      select distinct local_feed_id as "localFeedId"
      from fever_feed_mappings
      where fever_account_id = $1
      order by local_feed_id asc
    `,
    [accountId],
  );
  return rows.map((row) => row.localFeedId);
}

export async function listActiveLocalFeedIdsByFeverAccountId(
  db: DbClient,
  accountId: string,
): Promise<string[]> {
  const { rows } = await db.query<{ localFeedId: string }>(
    `
      select distinct local_feed_id as "localFeedId"
      from fever_feed_mappings
      where fever_account_id = $1
        and is_active = true
      order by local_feed_id asc
    `,
    [accountId],
  );
  return rows.map((row) => row.localFeedId);
}

export async function markMissingFeverFeedMappingsInactive(
  db: DbClient,
  input: { accountId: string; seenRemoteFeedIds: string[] },
): Promise<void> {
  await db.query(
    `
      update fever_feed_mappings
      set
        is_active = false,
        last_seen_at = now()
      where fever_account_id = $1
        and not (fever_feed_id = any($2::text[]))
    `,
    [input.accountId, input.seenRemoteFeedIds],
  );
}

export async function upsertFeverItemMapping(
  db: DbClient,
  input: {
    accountId: string;
    feverItemId: string;
    feverFeedId: string;
    localFeedId: string;
    localArticleId: string;
    remoteIsRead: boolean;
    remoteIsSaved: boolean;
    remoteCreatedAt?: string | null;
  },
): Promise<void> {
  await db.query(
    `
      insert into fever_item_mappings(
        fever_account_id,
        fever_item_id,
        fever_feed_id,
        local_feed_id,
        local_article_id,
        remote_is_read,
        remote_is_saved,
        remote_created_at,
        is_active,
        last_seen_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, true, now())
      on conflict (fever_account_id, fever_item_id)
      do update set
        fever_feed_id = excluded.fever_feed_id,
        local_feed_id = excluded.local_feed_id,
        local_article_id = excluded.local_article_id,
        remote_is_read = excluded.remote_is_read,
        remote_is_saved = excluded.remote_is_saved,
        remote_created_at = excluded.remote_created_at,
        is_active = true,
        last_seen_at = now()
    `,
    [
      input.accountId,
      input.feverItemId,
      input.feverFeedId,
      input.localFeedId,
      input.localArticleId,
      input.remoteIsRead,
      input.remoteIsSaved,
      input.remoteCreatedAt ?? null,
    ],
  );
}

export async function getFeverItemMappingByLocalArticleId(
  db: DbClient,
  localArticleId: string,
): Promise<FeverItemMappingRow | null> {
  const { rows } = await db.query<FeverItemMappingRow>(
    `
      select
        fim.fever_account_id as "feverAccountId",
        fim.fever_item_id as "feverItemId",
        fim.fever_feed_id as "feverFeedId",
        fim.local_feed_id as "localFeedId",
        fim.local_article_id as "localArticleId",
        fim.remote_is_read as "remoteIsRead",
        fim.remote_is_saved as "remoteIsSaved",
        fim.is_active as "isActive"
      from fever_item_mappings fim
      join fever_feed_mappings ffm
        on ffm.fever_account_id = fim.fever_account_id
        and ffm.fever_feed_id = fim.fever_feed_id
      join fever_accounts fa
        on fa.id = fim.fever_account_id
      where fim.local_article_id = $1
        and fim.is_active = true
        and ffm.is_active = true
        and fa.enabled = true
      limit 1
    `,
    [localArticleId],
  );
  return rows[0] ?? null;
}

export async function listUnreadActiveFeverItemMappings(
  db: DbClient,
  input: { feedId?: string },
): Promise<FeverUnreadItemMappingRow[]> {
  const values: string[] = [];
  const whereParts = [
    'articles.id = fever_item_mappings.local_article_id',
    'fever_item_mappings.is_active = true',
    'ffm.is_active = true',
    'fa.enabled = true',
    'articles.is_read = false',
  ];

  if (input.feedId) {
    values.push(input.feedId);
    whereParts.push(`articles.feed_id = $${values.length}`);
  }

  const { rows } = await db.query<FeverUnreadItemMappingRow>(
    `
      select
        fever_item_mappings.fever_account_id as "feverAccountId",
        fever_item_mappings.fever_item_id as "feverItemId",
        fever_item_mappings.local_article_id as "localArticleId"
      from fever_item_mappings
      join fever_feed_mappings ffm
        on ffm.fever_account_id = fever_item_mappings.fever_account_id
        and ffm.fever_feed_id = fever_item_mappings.fever_feed_id
      join fever_accounts fa
        on fa.id = fever_item_mappings.fever_account_id
      join articles on ${whereParts.join(' and ')}
      order by fever_item_mappings.fever_account_id asc, fever_item_mappings.local_article_id asc
    `,
    values,
  );
  return rows;
}

export async function listAllFeverMappedArticleIds(
  db: DbClient,
  input: { feedId?: string },
): Promise<string[]> {
  const values: string[] = [];
  const whereParts = [
    'articles.id = fever_item_mappings.local_article_id',
  ];

  if (input.feedId) {
    values.push(input.feedId);
    whereParts.push(`articles.feed_id = $${values.length}`);
  }

  const { rows } = await db.query<{ localArticleId: string }>(
    `
      select distinct fever_item_mappings.local_article_id as "localArticleId"
      from fever_item_mappings
      join articles on ${whereParts.join(' and ')}
      order by fever_item_mappings.local_article_id asc
    `,
    values,
  );
  return rows.map((row) => row.localArticleId);
}

export async function markMissingFeverItemMappingsInactive(
  db: DbClient,
  input: { accountId: string; seenRemoteItemIds: string[] },
): Promise<void> {
  await db.query(
    `
      update fever_item_mappings
      set
        is_active = false,
        last_seen_at = now()
      where fever_account_id = $1
        and not (fever_item_id = any($2::text[]))
    `,
    [input.accountId, input.seenRemoteItemIds],
  );
}
