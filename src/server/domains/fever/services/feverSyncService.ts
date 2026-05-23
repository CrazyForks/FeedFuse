import type { Pool } from 'pg';
import {
  getArticleByFeedAndDedupeKey,
  insertArticleIgnoreDuplicate,
  setArticleRead,
  setArticleStarred,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  createFeed,
  getFeedByUrl,
  type FeedRow,
} from '@/server/domains/feeds/repositories/feedsRepo';
import {
  getFeverFeedMappingByRemoteFeedId,
  markMissingFeverFeedMappingsInactive,
  markMissingFeverItemMappingsInactive,
  upsertFeverFeedMapping,
  upsertFeverItemMapping,
} from '@/server/domains/fever/repositories/feverMappingsRepo';
import { updateFeverAccountSyncState } from '@/server/domains/fever/repositories/feverAccountsRepo';
import type { FeverClient } from '@/server/integrations/fever/feverClient';
import type { FeverFeed, FeverItem } from '@/server/integrations/fever/feverSchemas';

async function ensureProjectedFeed(
  pool: Pool,
  remoteFeed: FeverFeed,
): Promise<FeedRow> {
  const existing = await getFeedByUrl(pool, remoteFeed.url);
  if (existing) {
    return existing;
  }

  // Fever feed 由上游托管，本地仅维护投影视图。
  return createFeed(pool, {
    title: remoteFeed.title || remoteFeed.url,
    url: remoteFeed.url,
    provider: 'fever',
    siteUrl: remoteFeed.siteUrl,
    iconUrl: null,
    enabled: true,
  });
}

export async function projectFeverItem(
  pool: Pool,
  input: {
    accountId: string;
    localFeedId: string;
    remoteItem: FeverItem;
  },
): Promise<{ articleId: string; created: boolean }> {
  const dedupeKey = `fever:${input.accountId}:${input.remoteItem.id}`;
  const created = await insertArticleIgnoreDuplicate(pool, {
    feedId: input.localFeedId,
    dedupeKey,
    title: input.remoteItem.title || '(untitled)',
    link: input.remoteItem.url ?? null,
    author: input.remoteItem.author ?? null,
    publishedAt: input.remoteItem.createdAt,
    contentHtml: input.remoteItem.html ?? null,
    summary: null,
    filterStatus: 'passed',
    isFiltered: false,
  });

  // 重复同步命中去重时复用现有 article，而不是把正常幂等路径当成错误。
  const existing = created
    ?? await getArticleByFeedAndDedupeKey(pool, {
      feedId: input.localFeedId,
      dedupeKey,
    });
  const articleId = existing?.id;
  if (!articleId) {
    throw new Error(`Failed to project Fever item ${input.remoteItem.id}`);
  }

  await setArticleRead(pool, articleId, input.remoteItem.isRead);
  await setArticleStarred(pool, articleId, input.remoteItem.isSaved);
  await upsertFeverItemMapping(pool, {
    accountId: input.accountId,
    feverItemId: input.remoteItem.id,
    feverFeedId: input.remoteItem.feedId,
    localFeedId: input.localFeedId,
    localArticleId: articleId,
    remoteIsRead: input.remoteItem.isRead,
    remoteIsSaved: input.remoteItem.isSaved,
    remoteCreatedAt: input.remoteItem.createdAt,
  });

  return { articleId, created: Boolean(created) };
}

export async function reconcileFeverItems(
  pool: Pool,
  input: { accountId: string; seenRemoteItemIds: string[] },
): Promise<void> {
  await markMissingFeverItemMappingsInactive(pool, input);
}

export async function syncFeverAccount(
  pool: Pool,
  input: { accountId: string; client: FeverClient },
): Promise<{ createdFeeds: number; createdArticles: number }> {
  try {
    const feeds = await input.client.listFeeds();
    const items = await input.client.listItems();
    let createdFeeds = 0;
    let createdArticles = 0;

    for (const remoteFeed of feeds) {
      const existingMapping = await getFeverFeedMappingByRemoteFeedId(pool, {
        accountId: input.accountId,
        feverFeedId: remoteFeed.id,
      });
      const localFeed = await ensureProjectedFeed(pool, remoteFeed);
      if (!existingMapping) {
        createdFeeds += 1;
      }

      await upsertFeverFeedMapping(pool, {
        accountId: input.accountId,
        feverFeedId: remoteFeed.id,
        localFeedId: localFeed.id,
        remoteTitle: remoteFeed.title,
        remoteUrl: remoteFeed.url,
        remoteGroupName: null,
        remoteFaviconUrl: null,
      });
    }

    for (const remoteItem of items) {
      const mapping = await getFeverFeedMappingByRemoteFeedId(pool, {
        accountId: input.accountId,
        feverFeedId: remoteItem.feedId,
      });
      if (!mapping) {
        continue;
      }

      await projectFeverItem(pool, {
        accountId: input.accountId,
        localFeedId: mapping.localFeedId,
        remoteItem,
      });
      createdArticles += 1;
    }

    await markMissingFeverFeedMappingsInactive(pool, {
      accountId: input.accountId,
      seenRemoteFeedIds: feeds.map((feed) => feed.id),
    });
    await reconcileFeverItems(pool, {
      accountId: input.accountId,
      seenRemoteItemIds: items.map((item) => item.id),
    });
    await updateFeverAccountSyncState(pool, {
      accountId: input.accountId,
      syncedAt: new Date().toISOString(),
      lastError: null,
    });

    return { createdFeeds, createdArticles };
  } catch (err) {
    const lastError =
      err instanceof Error && err.message.trim() ? err.message : 'Fever 同步失败，请稍后重试';

    // 同步失败也要写回账号状态，否则设置页只能看到“开始同步”而没有终态。
    await updateFeverAccountSyncState(pool, {
      accountId: input.accountId,
      lastError,
    });
    throw err;
  }
}
