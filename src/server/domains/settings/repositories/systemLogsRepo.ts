import type { Pool, PoolClient } from 'pg';
import type { SystemLogItem, SystemLogLevel } from '@/types';

export type { SystemLogItem, SystemLogLevel };

type Queryable = Pool | PoolClient;

interface InsertSystemLogInput extends Omit<SystemLogItem, 'id' | 'createdAt' | 'userId'> {
  userId?: string | null;
}

function normalizeContext(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function insertSystemLog(
  pool: Queryable,
  input: InsertSystemLogInput,
): Promise<void> {
  await pool.query(
    `
      insert into system_logs (
        user_id,
        level,
        category,
        message,
        details,
        source,
        context_json
      )
      values ($1, $2, $3, $4, $5, $6, $7)
    `,
    [
      input.userId ?? null,
      input.level,
      input.category,
      input.message,
      input.details,
      input.source,
      input.context,
    ],
  );
}

export async function listSystemLogs(
  pool: Queryable,
  input: { userId?: string | null; keyword?: string; page: number; pageSize: number },
): Promise<{ items: SystemLogItem[]; total: number }> {
  const keyword = input.keyword?.trim();
  const params: unknown[] = [];
  const whereParts: string[] = [];

  if (input.userId) {
    params.push(input.userId);
    whereParts.push(`user_id = $${params.length}`);
  }

  if (keyword) {
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
    whereParts.push(
      `(message ilike $${params.length - 2} or source ilike $${params.length - 1} or category ilike $${params.length})`,
    );
  }

  const whereSql = whereParts.length > 0 ? `where ${whereParts.join(' and ')}` : '';
  const offset = (input.page - 1) * input.pageSize;

  const countResult = await pool.query<{ count: string }>(
    `
      select count(*)::text as count
      from system_logs
      ${whereSql}
    `,
    params,
  );

  const { rows } = await pool.query<SystemLogItem & { context: unknown }>(
    `
      select
        id::text as id,
        user_id::text as "userId",
        level,
        category,
        message,
        details,
        source,
        context_json as context,
        created_at as "createdAt"
      from system_logs
      ${whereSql}
      order by created_at desc, id desc
      offset $${params.length + 1}
      limit $${params.length + 2}
    `,
    [...params, offset, input.pageSize],
  );

  const items = rows.map((row) => ({
    ...row,
    context: normalizeContext(row.context),
  }));
  const total = Number(countResult.rows[0]?.count ?? 0);

  return { items, total };
}

export async function deleteExpiredSystemLogs(
  pool: Queryable,
  input: { retentionDays: number },
): Promise<number> {
  const result = await pool.query(
    `
      delete from system_logs
      where created_at < now() - make_interval(days => $1)
    `,
    [input.retentionDays],
  );

  return result.rowCount ?? 0;
}

export async function deleteAllSystemLogs(
  pool: Queryable,
  input: { userId?: string | null } = {},
): Promise<number> {
  const params: unknown[] = [];
  const whereSql = input.userId ? 'where user_id = $1' : '';
  if (input.userId) {
    params.push(input.userId);
  }

  const result = await pool.query(
    `
      delete from system_logs
      ${whereSql}
    `,
    params,
  );

  return result.rowCount ?? 0;
}
