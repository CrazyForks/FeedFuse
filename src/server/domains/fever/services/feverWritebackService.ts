import type { Pool } from 'pg';
import { ValidationError } from '@/server/infra/http/errors';
import {
  markAllRead,
  setArticleRead,
  setArticleStarred,
} from '@/server/domains/articles/repositories/articlesRepo';
import { getFeverAccountById } from '@/server/domains/fever/repositories/feverAccountsRepo';
import {
  getFeverItemMappingByLocalArticleId,
  hasAnyFeverItemMappingByLocalArticleId,
  listAllFeverMappedArticleIds,
  listUnreadActiveFeverItemMappings,
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
  input: {
    articleId: string;
    isRead?: boolean;
    isStarred?: boolean;
    requireRemoteWriteback?: boolean;
  },
): Promise<void> {
  const mapping = await getFeverItemMappingByLocalArticleId(pool, input.articleId);

  if (!mapping) {
    const hasFeverMapping = input.requireRemoteWriteback
      ? await hasAnyFeverItemMappingByLocalArticleId(pool, input.articleId)
      : false;
    if (hasFeverMapping) {
      throw new ValidationError('Invalid request body', {
        articleId: 'Fever 来源已失效或账号已停用，无法写回远端状态',
      });
    }
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
  const unreadMappings = await listUnreadActiveFeverItemMappings(pool, input);
  // 任意 Fever 映射文章都不能走本地批量兜底，否则会绕过远端权威状态。
  const feverMappedArticleIds = await listAllFeverMappedArticleIds(pool, input);
  const clientByAccountId = new Map<string, FeverClient>();

  for (const mapping of unreadMappings) {
    let client = clientByAccountId.get(mapping.feverAccountId);
    if (!client) {
      client = await createClientForAccount(pool, mapping.feverAccountId);
      clientByAccountId.set(mapping.feverAccountId, client);
    }

    await client.markItem({
      itemId: mapping.feverItemId,
      as: 'read',
    });
  }

  // 远端确认成功后再落本地，避免批量入口出现远端失败但本地已读的漂移。
  for (const mapping of unreadMappings) {
    await setArticleRead(pool, mapping.localArticleId, true);
  }

  const updatedLocalCount = await markAllRead(pool, {
    ...input,
    excludeArticleIds: feverMappedArticleIds,
  });
  return updatedLocalCount;
}
