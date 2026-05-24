import type { Pool } from 'pg';
import {
  insertArticleMediaAttachments,
  getArticleByFeedAndDedupeKey,
  insertArticleIgnoreDuplicate,
  setArticleRead,
  setArticleStarred,
  type ArticleMediaAttachmentInput,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  createCategory,
  findCategoryByNormalizedName,
  getNextCategoryPosition,
} from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  createFeed,
  getFeedById,
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

export interface FeverProjectedArticle {
  title: string;
  link: string | null;
  author: string | null;
  publishedAt: string | null;
  contentHtml: string | null;
  summary: string | null;
  sourceLanguage: string | null;
  previewImageUrl: string | null;
  mediaAttachments: ArticleMediaAttachmentInput[];
  isPodcastSource: boolean;
}

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
  existingLocalFeedId: string | null,
): Promise<FeedRow> {
  const resolvedCategoryId = await resolveFeverFeedCategoryId(pool, remoteFeed);
  const resolvedSiteUrl = resolveFeverFeedSiteUrl(remoteFeed);
  const existing = existingLocalFeedId
    ? await getFeedById(pool, existingLocalFeedId)
    : null;
  if (existing) {
    const nextIconUrl = resolvedSiteUrl ? buildFeedFaviconPath(existing.id) : null;
    const needsUpdate =
      existing.title !== (remoteFeed.title || remoteFeed.url)
      || existing.url !== remoteFeed.url
      || existing.siteUrl !== resolvedSiteUrl
      || existing.categoryId !== resolvedCategoryId
      || existing.iconUrl !== nextIconUrl;

    if (!needsUpdate) {
      return existing;
    }

    // Fever 投影视图需要补齐本地分类、可抓取的 siteUrl 和内部 favicon 路由。
    return (await updateFeed(pool, existing.id, {
      title: remoteFeed.title || remoteFeed.url,
      url: remoteFeed.url,
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
    localFeed: FeedRow;
    remoteItem: FeverItem;
    projectedArticle?: FeverProjectedArticle | null;
    onCreated?: (payload: { articleId: string; feed: FeedRow }) => Promise<void>;
  },
): Promise<{ articleId: string; created: boolean }> {
  const dedupeKey = `fever:${input.accountId}:${input.remoteItem.id}`;
  const projectedArticle = input.projectedArticle;
  const isPodcastSource = projectedArticle?.isPodcastSource ?? false;
  const created = await insertArticleIgnoreDuplicate(pool, {
    feedId: input.localFeed.id,
    dedupeKey,
    title: projectedArticle?.title || input.remoteItem.title || '(untitled)',
    link: projectedArticle?.link ?? input.remoteItem.url ?? null,
    author: projectedArticle?.author ?? input.remoteItem.author ?? null,
    publishedAt: projectedArticle?.publishedAt ?? input.remoteItem.createdAt,
    contentHtml: projectedArticle?.contentHtml ?? null,
    previewImageUrl: projectedArticle?.previewImageUrl ?? null,
    summary: projectedArticle?.summary ?? null,
    sourceLanguage: projectedArticle?.sourceLanguage ?? null,
    // Fever 新文章和本地 RSS 一样，先入 pending，再交给 article.filter 决定后续链路。
    filterStatus: isPodcastSource ? 'passed' : 'pending',
    isFiltered: false,
    filteredBy: [],
    filterEvaluatedAt: isPodcastSource ? new Date().toISOString() : null,
  });

  if (created && projectedArticle?.mediaAttachments.length) {
    await insertArticleMediaAttachments(pool, created.id, projectedArticle.mediaAttachments);
  }

  // 重复同步命中去重时复用现有 article，而不是把正常幂等路径当成错误。
  const existing = created
    ?? await getArticleByFeedAndDedupeKey(pool, {
      feedId: input.localFeed.id,
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
    localFeedId: input.localFeed.id,
    localArticleId: articleId,
    remoteIsRead: input.remoteItem.isRead,
    remoteIsSaved: input.remoteItem.isSaved,
    remoteCreatedAt: input.remoteItem.createdAt,
  });

  if (created && !isPodcastSource && input.onCreated) {
    await input.onCreated({ articleId, feed: input.localFeed });
  }

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
  input: {
    accountId: string;
    client: FeverClient;
    sinceItemId?: string | null;
    maxItemId?: string | null;
    reconcileMissingItems?: boolean;
    hasFullItemSnapshot?: boolean;
    resolveArticleProjection?: (payload: {
      remoteFeed: FeverFeed;
      localFeed: FeedRow;
      remoteItem: FeverItem;
    }) => Promise<FeverProjectedArticle | null>;
    onArticleCreated?: (payload: { articleId: string; feed: FeedRow }) => Promise<void>;
  },
): Promise<{ createdFeeds: number; createdArticles: number; items: FeverItem[] }> {
  try {
    const feeds = await input.client.listFeeds();
    const items = await input.client.listItems(
      input.sinceItemId ?? undefined,
      input.maxItemId ?? undefined,
    );
    let createdFeeds = 0;
    let createdArticles = 0;
    const localFeedByRemoteFeedId = new Map<string, FeedRow>();
    const processedRemoteFeedIds: string[] = [];
    const remoteFeedById = new Map<string, FeverFeed>();

    for (const remoteFeed of feeds) {
      remoteFeedById.set(remoteFeed.id, remoteFeed);
      const existingMapping = await getFeverFeedMappingByRemoteFeedId(pool, {
        accountId: input.accountId,
        feverFeedId: remoteFeed.id,
      });
      const localFeed = await ensureProjectedFeed(
        pool,
        remoteFeed,
        existingMapping?.localFeedId ?? null,
      );
      if (!existingMapping) {
        createdFeeds += 1;
      }

      localFeedByRemoteFeedId.set(remoteFeed.id, localFeed);
      processedRemoteFeedIds.push(remoteFeed.id);

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
      const localFeed = localFeedByRemoteFeedId.get(remoteItem.feedId);
      if (!localFeed) {
        continue;
      }

      const remoteFeed = remoteFeedById.get(remoteItem.feedId);
      const projectedArticle =
        remoteFeed && input.resolveArticleProjection
          ? await input.resolveArticleProjection({ remoteFeed, localFeed, remoteItem })
          : null;
      const result = await projectFeverItem(pool, {
        accountId: input.accountId,
        localFeed,
        remoteItem,
        projectedArticle,
        onCreated: input.onArticleCreated,
      });
      if (result.created) {
        createdArticles += 1;
      }
    }

    await markMissingFeverFeedMappingsInactive(pool, {
      accountId: input.accountId,
      seenRemoteFeedIds: processedRemoteFeedIds,
    });
    if (input.reconcileMissingItems && input.hasFullItemSnapshot !== false) {
      // 只有明确走全量校正时，items 响应才能参与失效判定。
      await reconcileFeverItems(pool, {
        accountId: input.accountId,
        seenRemoteItemIds: items.map((item) => item.id),
      });
    }

    await updateFeverAccountSyncState(pool, {
      accountId: input.accountId,
      syncedAt: new Date().toISOString(),
      lastError: null,
    });

    return { createdFeeds, createdArticles, items };
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
