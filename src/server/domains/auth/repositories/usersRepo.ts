import type { Pool, PoolClient } from 'pg';

type DbClient = Pool | PoolClient;

export type UserRole = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled';

export interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}

export type PublicUserRow = Omit<UserRow, 'passwordHash'>;

const userColumns = `
  id,
  username,
  password_hash as "passwordHash",
  role,
  status,
  session_version as "sessionVersion",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const publicUserColumns = `
  id,
  username,
  role,
  status,
  session_version as "sessionVersion",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

function normalizeUsername(username: string): string {
  return username.trim();
}

export async function ensureUserSettings(db: DbClient, userId: string): Promise<void> {
  await db.query(
    `
      insert into user_settings(user_id)
      values ($1)
      on conflict (user_id) do nothing
    `,
    [userId],
  );
}

export async function findUserByUsername(
  db: DbClient,
  username: string,
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `
      select ${userColumns}
      from users
      where lower(username) = lower($1)
      limit 1
    `,
    [normalizeUsername(username)],
  );

  return rows[0] ?? null;
}

export async function getUserById(db: DbClient, userId: string): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `
      select ${userColumns}
      from users
      where id = $1
      limit 1
    `,
    [userId],
  );

  return rows[0] ?? null;
}

export async function listUsers(db: DbClient): Promise<PublicUserRow[]> {
  const { rows } = await db.query<PublicUserRow>(
    `
      select ${publicUserColumns}
      from users
      order by created_at asc, id asc
    `,
  );

  return rows;
}

export async function createUser(
  db: DbClient,
  input: { username: string; passwordHash: string; role: UserRole },
): Promise<UserRow> {
  await db.query('begin');
  try {
    const { rows } = await db.query<UserRow>(
      `
        insert into users(username, password_hash, role, status)
        values ($1, $2, $3, 'active')
        returning ${userColumns}
      `,
      [normalizeUsername(input.username), input.passwordHash, input.role],
    );
    const user = rows[0];
    await ensureUserSettings(db, user.id);
    await db.query('commit');
    return user;
  } catch (err) {
    await db.query('rollback');
    throw err;
  }
}

export async function setUserStatus(
  db: DbClient,
  input: { userId: string; status: UserStatus },
): Promise<PublicUserRow | null> {
  const { rows } = await db.query<PublicUserRow>(
    `
      update users
      set
        status = $2,
        session_version = session_version + 1,
        updated_at = now()
      where id = $1
      returning ${publicUserColumns}
    `,
    [input.userId, input.status],
  );

  return rows[0] ?? null;
}

export async function resetUserPassword(
  db: DbClient,
  input: { userId: string; passwordHash: string },
): Promise<PublicUserRow | null> {
  const { rows } = await db.query<PublicUserRow>(
    `
      update users
      set
        password_hash = $2,
        session_version = session_version + 1,
        updated_at = now()
      where id = $1
      returning ${publicUserColumns}
    `,
    [input.userId, input.passwordHash],
  );

  return rows[0] ?? null;
}

export async function changeUserPassword(
  db: DbClient,
  input: { userId: string; passwordHash: string },
): Promise<PublicUserRow | null> {
  return resetUserPassword(db, input);
}

export async function updateUser(
  db: DbClient,
  input: {
    userId: string;
    username?: string;
    role?: UserRole;
    status?: UserStatus;
    passwordHash?: string;
  },
): Promise<PublicUserRow | null> {
  const values: string[] = [input.userId];
  const assignments: string[] = [];
  const shouldBumpSessionVersion =
    input.role !== undefined || input.status !== undefined || input.passwordHash !== undefined;

  // 只拼接实际提交的字段，避免空 patch 覆盖现有数据。
  if (input.username !== undefined) {
    values.push(normalizeUsername(input.username));
    assignments.push(`username = $${values.length}`);
  }

  if (input.role !== undefined) {
    values.push(input.role);
    assignments.push(`role = $${values.length}`);
  }

  if (input.status !== undefined) {
    values.push(input.status);
    assignments.push(`status = $${values.length}`);
  }

  if (input.passwordHash !== undefined) {
    values.push(input.passwordHash);
    assignments.push(`password_hash = $${values.length}`);
  }

  if (assignments.length === 0) {
    return null;
  }

  if (shouldBumpSessionVersion) {
    assignments.push('session_version = session_version + 1');
  }
  assignments.push('updated_at = now()');

  const { rows } = await db.query<PublicUserRow>(
    `
      update users
      set ${assignments.join(', ')}
      where id = $1
      returning ${publicUserColumns}
    `,
    values,
  );

  return rows[0] ?? null;
}

export async function persistInitialAdminPassword(
  db: DbClient,
  input: { userId: string; passwordHash: string },
): Promise<UserRow | null> {
  const { rows } = await db.query<UserRow>(
    `
      update users
      set
        password_hash = $2,
        session_version = session_version + 1,
        updated_at = now()
      where id = $1 and password_hash = ''
      returning ${userColumns}
    `,
    [input.userId, input.passwordHash],
  );

  return rows[0] ?? null;
}
