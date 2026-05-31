import type { Pool, PoolClient } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

type DbClient = Pool | PoolClient;

export type AiDigestRunStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'skipped_no_updates';

export interface AiDigestConfigRow {
  userId: string;
  feedId: string;
  prompt: string;
  intervalMinutes: number;
  topN: number;
  selectedFeedIds: string[];
  selectedCategoryIds: string[];
  lastWindowEndAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiDigestRunRow {
  id: string;
  userId: string;
  feedId: string;
  windowStartAt: string;
  windowEndAt: string;
  status: AiDigestRunStatus;
  candidateTotal: number;
  selectedCount: number;
  articleId: string | null;
  model: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  jobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AiDigestRunSourceRow {
  runId: string;
  sourceArticleId: string;
  position: number;
  createdAt: string;
}

export interface AiDigestArticleSourceDetailRow {
  articleId: string;
  feedId: string;
  feedTitle: string;
  title: string;
  link: string | null;
  publishedAt: string | null;
  position: number;
}

const aiDigestConfigSelectSql = `
        user_id::text as "userId",
        feed_id as "feedId",
        prompt,
        interval_minutes as "intervalMinutes",
        top_n as "topN",
        selected_feed_ids as "selectedFeedIds",
        selected_category_ids as "selectedCategoryIds",
        last_window_end_at as "lastWindowEndAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
`;

const aiDigestRunSelectSql = `
        id,
        user_id::text as "userId",
        feed_id as "feedId",
        window_start_at as "windowStartAt",
        window_end_at as "windowEndAt",
        status,
        candidate_total as "candidateTotal",
        selected_count as "selectedCount",
        article_id as "articleId",
        model,
        error_code as "errorCode",
        error_message as "errorMessage",
        job_id as "jobId",
        created_at as "createdAt",
        updated_at as "updatedAt"
`;

export async function createAiDigestConfig(
  db: DbClient,
  input: {
    feedId: string;
    prompt: string;
    intervalMinutes: number;
    topN?: number;
    selectedFeedIds: string[];
    lastWindowEndAt: string;
    userId?: string;
  },
): Promise<AiDigestConfigRow> {
  const userId = normalizeUserId(input.userId);
  const { rows } = await db.query<AiDigestConfigRow>(
    `
      insert into ai_digest_configs(
        user_id,
        feed_id,
        prompt,
        interval_minutes,
        top_n,
        selected_feed_ids,
        selected_category_ids,
        last_window_end_at
      )
      values ($1, $2, $3, $4, $5, $6::bigint[], '{}'::bigint[], $7::timestamptz)
      returning
        ${aiDigestConfigSelectSql}
    `,
    [
      userId,
      input.feedId,
      input.prompt,
      input.intervalMinutes,
      input.topN ?? 500,
      input.selectedFeedIds,
      input.lastWindowEndAt,
    ],
  );
  return rows[0];
}

export async function getAiDigestConfigByFeedId(
  db: DbClient,
  feedId: string,
  userId?: string,
): Promise<AiDigestConfigRow | null> {
  const { rows } = await db.query<AiDigestConfigRow>(
    `
      select
        ${aiDigestConfigSelectSql}
      from ai_digest_configs
      where user_id = $1
        and feed_id = $2
      limit 1
    `,
    [normalizeUserId(userId), feedId],
  );
  return rows[0] ?? null;
}

export async function updateAiDigestConfig(
  db: DbClient,
  feedId: string,
  patch: Partial<{
    prompt: string;
    intervalMinutes: number;
    topN: number;
    selectedFeedIds: string[];
    lastWindowEndAt: string;
    userId?: string;
  }>,
): Promise<AiDigestConfigRow | null> {
  const userId = normalizeUserId(patch.userId);
  const fields: string[] = [];
  const values: Array<string | number | string[]> = [];
  let paramIndex = 1;

  if (typeof patch.prompt !== 'undefined') {
    fields.push(`prompt = $${paramIndex++}`);
    values.push(patch.prompt);
  }
  if (typeof patch.intervalMinutes !== 'undefined') {
    fields.push(`interval_minutes = $${paramIndex++}`);
    values.push(patch.intervalMinutes);
  }
  if (typeof patch.topN !== 'undefined') {
    fields.push(`top_n = $${paramIndex++}`);
    values.push(patch.topN);
  }
  if (typeof patch.selectedFeedIds !== 'undefined') {
    fields.push(`selected_feed_ids = $${paramIndex++}::bigint[]`);
    values.push(patch.selectedFeedIds);
  }
  if (typeof patch.lastWindowEndAt !== 'undefined') {
    fields.push(`last_window_end_at = $${paramIndex++}::timestamptz`);
    values.push(patch.lastWindowEndAt);
  }
  if (fields.length === 0) {
    return getAiDigestConfigByFeedId(db, feedId, userId);
  }

  fields.push('updated_at = now()');
  values.push(feedId);
  values.push(userId);

  const { rows } = await db.query<AiDigestConfigRow>(
    `
      update ai_digest_configs
      set ${fields.join(', ')}
      where feed_id = $${paramIndex}
        and user_id = $${paramIndex + 1}
      returning
        ${aiDigestConfigSelectSql}
    `,
    values,
  );
  return rows[0] ?? null;
}

export async function updateAiDigestConfigLastWindowEndAt(
  db: DbClient,
  feedId: string,
  lastWindowEndAt: string,
  userId?: string,
): Promise<void> {
  await db.query(
    `
      update ai_digest_configs
      set
        last_window_end_at = $2::timestamptz,
        updated_at = now()
      where feed_id = $1
        and user_id = $3
    `,
    [feedId, lastWindowEndAt, normalizeUserId(userId)],
  );
}

export async function listDueAiDigestConfigFeedIds(
  db: DbClient,
  input: { now: Date; userId?: string },
): Promise<string[]> {
  const { rows } = await db.query<{ feedId: string }>(
    `
      select c.feed_id as "feedId"
      from ai_digest_configs c
      join feeds on feeds.id = c.feed_id
      where
        c.user_id = $1
        and feeds.user_id = $1
        and feeds.kind = 'ai_digest'
        and feeds.enabled = true
        and c.last_window_end_at <= ($2::timestamptz - (c.interval_minutes * interval '1 minute'))
      order by c.last_window_end_at asc, c.feed_id asc
    `,
    [normalizeUserId(input.userId), input.now.toISOString()],
  );
  return rows.map((row) => row.feedId);
}

export async function getAiDigestRunByFeedIdAndWindowStartAt(
  db: DbClient,
  input: { feedId: string; windowStartAt: string; userId?: string },
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      select
        ${aiDigestRunSelectSql}
      from ai_digest_runs
      where user_id = $1
        and feed_id = $2
        and window_start_at = $3::timestamptz
      limit 1
    `,
    [normalizeUserId(input.userId), input.feedId, input.windowStartAt],
  );
  return rows[0] ?? null;
}

export async function getAiDigestRunById(
  db: DbClient,
  runId: string,
  userId?: string,
): Promise<AiDigestRunRow | null> {
  const { rows } = await db.query<AiDigestRunRow>(
    `
      select
        ${aiDigestRunSelectSql}
      from ai_digest_runs
      where id = $1
        and user_id = $2
      limit 1
    `,
    [runId, normalizeUserId(userId)],
  );
  return rows[0] ?? null;
}

export async function createAiDigestRun(
  db: DbClient,
  input: {
    feedId: string;
    windowStartAt: string;
    windowEndAt: string;
    status: AiDigestRunStatus;
    userId?: string;
  },
): Promise<AiDigestRunRow | null> {
  const userId = normalizeUserId(input.userId);
  const { rows } = await db.query<AiDigestRunRow>(
    `
      insert into ai_digest_runs(user_id, feed_id, window_start_at, window_end_at, status)
      values ($1, $2, $3::timestamptz, $4::timestamptz, $5)
      on conflict (user_id, feed_id, window_start_at) do nothing
      returning
        ${aiDigestRunSelectSql}
    `,
    [userId, input.feedId, input.windowStartAt, input.windowEndAt, input.status],
  );
  return rows[0] ?? null;
}

export async function updateAiDigestRun(
  db: DbClient,
  runId: string,
  patch: Partial<{
    status: AiDigestRunStatus;
    candidateTotal: number;
    selectedCount: number;
    articleId: string | null;
    model: string | null;
    errorCode: string | null;
    errorMessage: string | null;
    jobId: string | null;
    userId?: string;
  }>,
): Promise<void> {
  const userId = normalizeUserId(patch.userId);
  const fields: string[] = [];
  const values: Array<string | number | null> = [];
  let index = 1;

  if (typeof patch.status !== 'undefined') {
    fields.push(`status = $${index++}`);
    values.push(patch.status);
  }
  if (typeof patch.candidateTotal !== 'undefined') {
    fields.push(`candidate_total = $${index++}`);
    values.push(patch.candidateTotal);
  }
  if (typeof patch.selectedCount !== 'undefined') {
    fields.push(`selected_count = $${index++}`);
    values.push(patch.selectedCount);
  }
  if (typeof patch.articleId !== 'undefined') {
    fields.push(`article_id = $${index++}`);
    values.push(patch.articleId);
  }
  if (typeof patch.model !== 'undefined') {
    fields.push(`model = $${index++}`);
    values.push(patch.model);
  }
  if (typeof patch.errorCode !== 'undefined') {
    fields.push(`error_code = $${index++}`);
    values.push(patch.errorCode);
  }
  if (typeof patch.errorMessage !== 'undefined') {
    fields.push(`error_message = $${index++}`);
    values.push(patch.errorMessage);
  }
  if (typeof patch.jobId !== 'undefined') {
    fields.push(`job_id = $${index++}`);
    values.push(patch.jobId);
  }

  if (fields.length === 0) return;

  fields.push('updated_at = now()');
  values.push(runId);
  values.push(userId);

  await db.query(
    `
      update ai_digest_runs
      set ${fields.join(', ')}
      where id = $${index}
        and user_id = $${index + 1}
    `,
    values,
  );
}

export async function replaceAiDigestRunSources(
  db: DbClient,
  input: {
    runId: string;
    sources: Array<{ sourceArticleId: string; position: number }>;
    userId?: string;
  },
): Promise<void> {
  const userId = normalizeUserId(input.userId);
  await db.query('delete from ai_digest_run_sources where run_id = $1 and user_id = $2', [
    input.runId,
    userId,
  ]);
  if (input.sources.length === 0) return;

  const values: Array<string | number> = [input.runId, userId];
  const placeholders = input.sources.map((source, index) => {
    const positionParam = index * 2 + 3;
    const articleParam = index * 2 + 4;
    values.push(source.position, source.sourceArticleId);
    return `($2, $1, $${articleParam}::bigint, $${positionParam})`;
  });

  await db.query(
    `
      insert into ai_digest_run_sources(user_id, run_id, source_article_id, position)
      values ${placeholders.join(', ')}
    `,
    values,
  );
}

export async function listAiDigestRunSourcesByArticleId(
  db: DbClient,
  articleId: string,
  userId?: string,
): Promise<AiDigestArticleSourceDetailRow[]> {
  const { rows } = await db.query<AiDigestArticleSourceDetailRow>(
    `
      select
        a.id as "articleId",
        a.feed_id as "feedId",
        f.title as "feedTitle",
        a.title,
        a.link,
        a.published_at as "publishedAt",
        s.position
      from ai_digest_runs r
      join ai_digest_run_sources s on s.run_id = r.id
      join articles a on a.id = s.source_article_id
      join feeds f on f.id = a.feed_id
      where r.article_id = $1
        and r.user_id = $2
        and s.user_id = $2
        and a.user_id = $2
        and f.user_id = $2
      order by s.position asc
    `,
    [articleId, normalizeUserId(userId)],
  );
  return rows;
}

export interface AiDigestCandidateArticleRow {
  id: string;
  feedId: string;
  feedTitle: string;
  title: string;
  summary: string | null;
  link: string | null;
  fetchedAt: string;
  contentFullHtml: string | null;
}

export async function listAiDigestCandidateArticles(
  db: DbClient,
  input: {
    targetFeedIds: string[];
    windowStartAt: string;
    windowEndAt: string;
    limit: number;
    userId?: string;
  },
): Promise<AiDigestCandidateArticleRow[]> {
  if (input.targetFeedIds.length === 0) return [];

  const { rows } = await db.query<AiDigestCandidateArticleRow>(
    `
      select
        a.id,
        a.feed_id as "feedId",
        f.title as "feedTitle",
        a.title,
        a.summary,
        a.link,
        a.fetched_at as "fetchedAt",
        a.content_full_html as "contentFullHtml"
      from articles a
      join feeds f on f.id = a.feed_id
      where
        a.user_id = $1
        and f.user_id = $1
        and a.feed_id = any($2::bigint[])
        and a.fetched_at > $3::timestamptz
        and a.fetched_at <= $4::timestamptz
        and a.filter_status = any('{passed,error}'::text[])
      order by a.fetched_at desc, a.id desc
      limit $5
    `,
    [
      normalizeUserId(input.userId),
      input.targetFeedIds,
      input.windowStartAt,
      input.windowEndAt,
      input.limit,
    ],
  );
  return rows;
}
