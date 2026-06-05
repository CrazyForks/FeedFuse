import type { Pool, PoolClient } from 'pg';
import { normalizeUserId } from '@/server/domains/users/userScope';

type DbClient = Pool | PoolClient;

export interface CategoryRow {
  id: string;
  name: string;
  position: number;
}

export async function listCategories(db: DbClient, userId?: string): Promise<CategoryRow[]> {
  const scopedUserId = normalizeUserId(userId);
  const { rows } = await db.query<CategoryRow>(
    'select id, name, position from categories where user_id = $1 order by position asc, name asc',
    [scopedUserId],
  );
  return rows;
}

export async function createCategory(
  db: DbClient,
  input: { name: string; position?: number; userId?: string },
): Promise<CategoryRow> {
  const scopedUserId = normalizeUserId(input.userId);
  const { rows } = await db.query<CategoryRow>(
    `
      insert into categories(user_id, name, position)
      values ($1, $2, $3)
      returning id, name, position
    `,
    [scopedUserId, input.name, input.position ?? 0],
  );
  return rows[0];
}

export async function updateCategory(
  db: DbClient,
  id: string,
  input: { name?: string; position?: number; userId?: string },
): Promise<CategoryRow | null> {
  const scopedUserId = normalizeUserId(input.userId);
  const fields: string[] = [];
  const values: Array<string | number> = [];
  let paramIndex = 1;

  if (typeof input.name !== 'undefined') {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (typeof input.position !== 'undefined') {
    fields.push(`position = $${paramIndex++}`);
    values.push(input.position);
  }
  if (fields.length === 0) return null;

  fields.push('updated_at = now()');
  values.push(id);
  values.push(scopedUserId);

  const { rows } = await db.query<CategoryRow>(
    `
      update categories
      set ${fields.join(', ')}
      where id = $${paramIndex}
        and user_id = $${paramIndex + 1}
      returning id, name, position
    `,
    values,
  );

  return rows[0] ?? null;
}

export async function deleteCategory(db: DbClient, id: string, userId?: string): Promise<boolean> {
  const res = await db.query('delete from categories where id = $1 and user_id = $2', [
    id,
    normalizeUserId(userId),
  ]);
  return (res.rowCount ?? 0) > 0;
}

export async function findCategoryByNormalizedName(
  db: DbClient,
  name: string,
  userId?: string,
): Promise<CategoryRow | null> {
  const { rows } = await db.query<CategoryRow>(
    `
      select id, name, position
      from categories
      where user_id = $1
        and lower(btrim(name)) = lower(btrim($2))
      limit 1
    `,
    [normalizeUserId(userId), name.trim()],
  );
  return rows[0] ?? null;
}

export async function getCategoryById(
  db: DbClient,
  id: string,
  userId?: string,
): Promise<CategoryRow | null> {
  const { rows } = await db.query<CategoryRow>(
    `
      select id, name, position
      from categories
      where id = $1
        and user_id = $2
      limit 1
    `,
    [id, normalizeUserId(userId)],
  );
  return rows[0] ?? null;
}

export async function getNextCategoryPosition(db: DbClient, userId?: string): Promise<number> {
  const { rows } = await db.query<{ nextPosition: number }>(
    'select coalesce(max(position), -1) + 1 as "nextPosition" from categories where user_id = $1',
    [normalizeUserId(userId)],
  );
  return rows[0]?.nextPosition ?? 0;
}

export async function reorderCategories(
  db: DbClient,
  items: Array<{ id: string; position: number }>,
  userId?: string,
): Promise<CategoryRow[]> {
  const scopedUserId = normalizeUserId(userId);
  await db.query('begin');
  try {
    const ids = items.map((item) => item.id);
    const positions = items.map((item) => item.position);

    const existing = await db.query<{ id: string }>(
      'select id from categories where user_id = $1 and id = any($2::bigint[])',
      [scopedUserId, ids],
    );
    if (existing.rows.length !== ids.length) {
      throw new Error('category_not_found');
    }

    await db.query(
      `
      update categories as c
      set position = v.position,
          updated_at = now()
      from (
        select unnest($1::bigint[]) as id, unnest($2::int[]) as position
      ) as v
      where c.id = v.id
        and c.user_id = $3
      `,
      [ids, positions, scopedUserId],
    );

    const result = await db.query<CategoryRow>(
      'select id, name, position from categories where user_id = $1 order by position asc, name asc',
      [scopedUserId],
    );

    await db.query('commit');
    return result.rows;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}
