import type { Pool, PoolClient } from 'pg';
import { deleteCategory } from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  countFeedsByCategoryId,
  deleteFeed,
  getFeedCategoryAssignment,
} from '@/server/domains/feeds/repositories/feedsRepo';
import { deleteFeverAccount } from '@/server/domains/fever/repositories/feverAccountsRepo';
import {
  listLocalFeedIdsByFeverAccountId,
} from '@/server/domains/fever/repositories/feverMappingsRepo';
import { normalizeUserId } from '@/server/domains/users/userScope';

async function cleanupCategoryIfEmpty(
  client: PoolClient,
  categoryId: string | null | undefined,
  userId?: string,
): Promise<void> {
  if (!categoryId) {
    return;
  }

  const remainingCount = await countFeedsByCategoryId(client, categoryId, userId);
  if (remainingCount === 0) {
    await deleteCategory(client, categoryId, userId);
  }
}

export async function deleteFeverAccountAndSources(
  pool: Pool,
  accountId: string,
  userId?: string,
): Promise<boolean> {
  const scopedUserId = normalizeUserId(userId);
  const client = await pool.connect();

  try {
    await client.query('begin');

    // 先取映射到的本地 feed，确保删除账号前还能找到需要清理的 fever 源。
    const localFeedIds = await listLocalFeedIdsByFeverAccountId(client, accountId, scopedUserId);

    for (const localFeedId of localFeedIds) {
      const existing = await getFeedCategoryAssignment(client, localFeedId, scopedUserId);
      if (!existing) {
        continue;
      }

      const deleted = await deleteFeed(client, localFeedId, scopedUserId);
      if (!deleted) {
        continue;
      }

      // fever 源删除后同步清理空分类，避免左栏残留空分组。
      await cleanupCategoryIfEmpty(client, existing.categoryId, scopedUserId);
    }

    const deletedAccount = await deleteFeverAccount(client, accountId, scopedUserId);
    await client.query('commit');
    return deletedAccount;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
