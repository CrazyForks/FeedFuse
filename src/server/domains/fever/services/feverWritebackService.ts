import type { Pool } from 'pg';
import {
  markAllRead,
  setArticleRead,
  setArticleStarred,
} from '@/server/domains/articles/repositories/articlesRepo';
import { getFeverAccountById } from '@/server/domains/fever/repositories/feverAccountsRepo';
import {
  getFeverItemMappingByLocalArticleId,
} from '@/server/domains/fever/repositories/feverMappingsRepo';
import { createFeverClient, type FeverClient } from '@/server/integrations/fever/feverClient';

export async function createClientForAccount(
  pool: Pool,
  accountId: string,
): Promise<FeverClient> {
  const account = await getFeverAccountById(pool, accountId);
  if (!account) {
    throw new Error(`Fever account ${accountId} not found`);
  }

  return createFeverClient({
    baseUrl: account.baseUrl,
    username: account.username,
    apiKey: account.apiKey,
  });
}

export async function updateArticleStateWithWriteback(
  pool: Pool,
  input: { articleId: string; isRead?: boolean; isStarred?: boolean },
): Promise<void> {
  const mapping = await getFeverItemMappingByLocalArticleId(pool, input.articleId);

  if (!mapping) {
    if (typeof input.isRead !== 'undefined') {
      await setArticleRead(pool, input.articleId, input.isRead);
    }
    if (typeof input.isStarred !== 'undefined') {
      await setArticleStarred(pool, input.articleId, input.isStarred);
    }
    return;
  }

  const client = await createClientForAccount(pool, mapping.feverAccountId);

  if (typeof input.isRead !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isRead ? 'read' : 'unread',
    });
    await setArticleRead(pool, input.articleId, input.isRead);
  }

  if (typeof input.isStarred !== 'undefined') {
    await client.markItem({
      itemId: mapping.feverItemId,
      as: input.isStarred ? 'saved' : 'unsaved',
    });
    await setArticleStarred(pool, input.articleId, input.isStarred);
  }
}

export async function markAllArticlesReadWithWriteback(
  pool: Pool,
  input: { feedId?: string },
): Promise<number> {
  // 批量接口先复用现有本地批量实现，后续再按 feed/source 维度细化远端聚合写回。
  return markAllRead(pool, input);
}
