import type { Pool, PoolClient } from 'pg';
import { deleteCategory } from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  countFeedsByCategoryId,
  deleteFeed,
  getFeedCategoryAssignment,
} from '@/server/domains/feeds/repositories/feedsRepo';
import { deleteFeverAccount } from '@/server/domains/fever/repositories/feverAccountsRepo';
import {
  countOtherActiveFeverAccountsByLocalFeedId,
  listLocalFeedIdsByFeverAccountId,
} from '@/server/domains/fever/repositories/feverMappingsRepo';

async function cleanupCategoryIfEmpty(
  client: PoolClient,
  categoryId: string | null | undefined,
): Promise<void> {
  if (!categoryId) {
    return;
  }

  const remainingCount = await countFeedsByCategoryId(client, categoryId);
  if (remainingCount === 0) {
    await deleteCategory(client, categoryId);
  }
}

export async function deleteFeverAccountAndSources(
  pool: Pool,
  accountId: string,
): Promise<boolean> {
  const client = await pool.connect();

  try {
    await client.query('begin');

    // 先取映射到的本地 feed，确保删除账号前还能找到需要清理的 fever 源。
    const localFeedIds = await listLocalFeedIdsByFeverAccountId(client, accountId);

    for (const localFeedId of localFeedIds) {
      // 只有仍处于启用状态的其他账号，才算这个投影源的有效共享引用。
      const sharedAccountCount = await countOtherActiveFeverAccountsByLocalFeedId(client, {
        accountId,
        localFeedId,
      });
      if (sharedAccountCount > 0) {
        continue;
      }

      const existing = await getFeedCategoryAssignment(client, localFeedId);
      if (!existing) {
        continue;
      }

      const deleted = await deleteFeed(client, localFeedId);
      if (!deleted) {
        continue;
      }

      // fever 源删除后同步清理空分类，避免左栏残留空分组。
      await cleanupCategoryIfEmpty(client, existing.categoryId);
    }

    const deletedAccount = await deleteFeverAccount(client, accountId);
    await client.query('commit');
    return deletedAccount;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
