import type { Pool, PoolClient } from 'pg';
import { deleteUser } from '@/server/domains/auth/repositories/usersRepo';

async function deleteOwnedData(client: PoolClient, userId: string): Promise<void> {
  // ai_digest_runs.article_id 对 articles 是 NO ACTION，必须先删运行记录再删文章/订阅源。
  await client.query('delete from ai_digest_runs where user_id = $1', [userId]);

  // 全量刷新可能没有具体 feed_id，因此不能只依赖删除 feeds 的级联清理。
  await client.query('delete from feed_refresh_runs where user_id = $1', [userId]);

  // Fever 账号拥有独立生命周期，先删账号可同步清掉映射和同步状态。
  await client.query('delete from fever_accounts where user_id = $1', [userId]);

  await client.query('delete from system_logs where user_id = $1', [userId]);
  await client.query('delete from feeds where user_id = $1', [userId]);
  await client.query('delete from categories where user_id = $1', [userId]);
}

export async function deleteUserAndOwnedData(pool: Pool, userId: string): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('begin');
    await deleteOwnedData(client, userId);
    const deleted = await deleteUser(client, { userId });
    await client.query('commit');
    return deleted;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
