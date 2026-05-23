import type { Pool } from 'pg';
import {
  getArticleByFeedAndDedupeKey,
  insertArticleIgnoreDuplicate,
  setArticleRead,
  setArticleStarred,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  createCategory,
  findCategoryByNormalizedName,
  getNextCategoryPosition,
} from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  createFeed,
  getFeedByUrl,
  updateFeed,
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
import { buildFeedFaviconPath } from '@/server/integrations/rss/feedFaviconUrl';

function resolveFeverFeedSiteUrl(remoteFeed: FeverFeed): string | null {
  if (remoteFeed.siteUrl) {
    return remoteFeed.siteUrl;
  }

  try {
    return new URL(remoteFeed.url).origin;
  } catch {
    return null;
  }
}

function normalizeCategoryName(name: string | null | undefined): string | null {
  const normalized = name?.trim() ?? '';
  if (!normalized || normalized === '未分类') {
    return null;
  }

  return normalized;
}

async function resolveFeverFeedCategoryId(
  pool: Pool,
  remoteFeed: FeverFeed,
): Promise<string | null> {
  const normalizedCategoryName = normalizeCategoryName(remoteFeed.groupName);
  if (!normalizedCategoryName) {
    return null;
  }

  const existing = await findCategoryByNormalizedName(pool, normalizedCategoryName);
  if (existing) {
    return existing.id;
  }

  // Fever 分组需要落成本地分类，保持左栏与上游目录结构一致。
  const position = await getNextCategoryPosition(pool);
  const created = await createCategory(pool, {
    name: normalizedCategoryName,
    position,
  });
  return created.id;
}

async function ensureProjectedFeed(
  pool: Pool,
  remoteFeed: FeverFeed,
): Promise<FeedRow> {
  const resolvedCategoryId = await resolveFeverFeedCategoryId(pool, remoteFeed);
  const resolvedSiteUrl = resolveFeverFeedSiteUrl(remoteFeed);
  const existing = await getFeedByUrl(pool, remoteFeed.url);
  if (existing) {
    const nextIconUrl = resolvedSiteUrl ? buildFeedFaviconPath(existing.id) : null;
    const needsUpdate =
      existing.categoryId !== resolvedCategoryId
      || existing.siteUrl !== resolvedSiteUrl
      || existing.iconUrl !== nextIconUrl;

    if (!needsUpdate) {
      return existing;
    }

    // Fever 投影视图需要补齐本地分类、可抓取的 siteUrl 和内部 favicon 路由。
    return (await updateFeed(pool, existing.id, {
      categoryId: resolvedCategoryId,
      siteUrl: resolvedSiteUrl,
      iconUrl: nextIconUrl,
    })) ?? existing;
  }

  const created = await createFeed(pool, {
    title: remoteFeed.title || remoteFeed.url,
    url: remoteFeed.url,
    provider: 'fever',
    categoryId: resolvedCategoryId,
    siteUrl: resolvedSiteUrl,
    iconUrl: null,
    enabled: true,
  });

  if (!resolvedSiteUrl) {
    return created;
  }

  // 统一走内部 favicon 路由，让 Fever 源复用现有缓存与抓取流程。
  return (
    await updateFeed(pool, created.id, {
      iconUrl: buildFeedFaviconPath(created.id),
    })
  ) ?? {
    ...created,
    iconUrl: buildFeedFaviconPath(created.id),
  };
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
        remoteGroupName: remoteFeed.groupName,
        remoteFaviconUrl: localFeed.iconUrl,
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
