import type { Pool } from 'pg';
import type { PgBoss } from 'pg-boss';
import { normalizePersistedSettings } from '@/features/settings/settingsSchema';
import { getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { syncFeverAccount } from '@/server/domains/fever/services/feverSyncService';
import {
  getFeverSyncStateByAccountId,
  upsertFeverSyncState,
} from '@/server/domains/fever/repositories/feverSyncStatesRepo';
import { sanitizeContent } from '@/server/integrations/rss/sanitizeContent';
import { fetchFeedXml } from '@/server/integrations/rss/fetchFeedXml';
import { parseFeed } from '@/server/integrations/rss/parseFeed';
import { getAppSettings } from '@/server/domains/settings/repositories/settingsRepo';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_ARTICLE_FILTER } from '@/server/infra/queue/jobs';
import { createClientForAccount } from '@/server/domains/fever/services/feverWritebackService';
import type { FeedRow } from '@/server/domains/feeds/repositories/feedsRepo';
import type { FeverFeed, FeverItem } from '@/server/integrations/fever/feverSchemas';
import type { ParsedFeed, ParsedFeedItem, ParsedFeedMediaAttachment } from '@/server/integrations/rss/parseFeed';
import type { ArticleFilterJobData } from '@/worker/articleFilterWorker';

const FULL_SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;

type FeverSyncDeps = {
  getAppSettings: typeof getAppSettings;
  getUiSettings: typeof getUiSettings;
  fetchFeedXml: typeof fetchFeedXml;
  parseFeed: typeof parseFeed;
  sanitizeContent: typeof sanitizeContent;
};

const defaultDeps: FeverSyncDeps = {
  getAppSettings,
  getUiSettings,
  fetchFeedXml,
  parseFeed,
  sanitizeContent,
};

function toArticleFilterJobData(
  feed: FeedRow,
  articleFilter: ArticleFilterJobData['articleFilter'],
): ArticleFilterJobData {
  return {
    articleId: '',
    articleFilter,
    feed: {
      fullTextOnFetchEnabled: feed.fullTextOnFetchEnabled,
      aiSummaryOnFetchEnabled: feed.aiSummaryOnFetchEnabled,
      bodyTranslateOnFetchEnabled: feed.bodyTranslateOnFetchEnabled,
      titleTranslateEnabled: feed.titleTranslateEnabled,
    },
  };
}

function matchParsedItem(
  remoteItem: FeverItem,
  parsedItems: ParsedFeedItem[],
): ParsedFeedItem | null {
  const remoteUrl = remoteItem.url?.trim() ?? '';
  if (remoteUrl) {
    const matchedByLink = parsedItems.find((item) => (item.link?.trim() ?? '') === remoteUrl);
    if (matchedByLink) {
      return matchedByLink;
    }
  }

  const remoteTitle = remoteItem.title.trim();
  const remoteCreatedAt = remoteItem.createdAt;
  if (!remoteTitle) {
    return null;
  }

  return (
    parsedItems.find((item) => {
      if (item.title.trim() !== remoteTitle) {
        return false;
      }

      if (!remoteCreatedAt) {
        return true;
      }

      return item.publishedAt.toISOString() === remoteCreatedAt;
    }) ?? null
  );
}

function mapMediaAttachments(
  attachments: ParsedFeedMediaAttachment[],
): Array<{
  url: string;
  mimeType: string;
  sizeBytes: number | null;
  durationSeconds: number | null;
}> {
  return attachments.map((attachment) => ({
    url: attachment.url,
    mimeType: attachment.mimeType,
    sizeBytes: attachment.sizeBytes,
    durationSeconds: attachment.durationSeconds,
  }));
}

async function loadParsedFeedSnapshot(
  deps: FeverSyncDeps,
  appSettings: Awaited<ReturnType<FeverSyncDeps['getAppSettings']>>,
  remoteFeed: FeverFeed,
  cache: Map<string, ParsedFeed | null>,
  userId?: string | null,
): Promise<ParsedFeed | null> {
  const cacheKey = remoteFeed.id;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) ?? null;
  }

  const res = await deps.fetchFeedXml(remoteFeed.url, {
    timeoutMs: appSettings.rssTimeoutMs,
    userAgent: appSettings.rssUserAgent,
    userId,
  });
  if (res.status < 200 || res.status >= 300 || !res.xml) {
    cache.set(cacheKey, null);
    return null;
  }

  const parsed = await deps.parseFeed(res.xml, new Date());
  cache.set(cacheKey, parsed);
  return parsed;
}

function resolveLatestRemoteItemId(items: FeverItem[]): string | null {
  if (items.length === 0) {
    return null;
  }

  return items.reduce<string | null>((latest, item) => {
    if (!latest) {
      return item.id;
    }

    const latestNumber = Number(latest);
    const itemNumber = Number(item.id);
    if (Number.isFinite(latestNumber) && Number.isFinite(itemNumber)) {
      return itemNumber > latestNumber ? item.id : latest;
    }

    return item.id > latest ? item.id : latest;
  }, null);
}

function shouldRunFullSync(lastFullSyncAt: string | null | undefined, now: Date): boolean {
  if (!lastFullSyncAt) {
    return true;
  }

  const lastFullSyncMs = new Date(lastFullSyncAt).getTime();
  if (Number.isNaN(lastFullSyncMs)) {
    return true;
  }

  return now.getTime() - lastFullSyncMs >= FULL_SYNC_INTERVAL_MS;
}

function resolveHighestKnownItemId(syncState: Awaited<ReturnType<typeof getFeverSyncStateByAccountId>>): string | null {
  return syncState?.lastIncrementalItemId ?? null;
}

export async function runFeverSyncWorker(input: {
  pool: Pool;
  boss: Pick<PgBoss, 'send'>;
  data: { userId?: string | null; accountId: string; runId?: string | null; feedIds?: string[] };
  deps?: Partial<FeverSyncDeps>;
}) {
  const deps = { ...defaultDeps, ...(input.deps ?? {}) };
  const client = await createClientForAccount(
    input.pool,
    input.data.accountId,
    input.data.userId ?? undefined,
  );
  const now = new Date();
  const appSettings = await deps.getAppSettings(input.pool);
  const uiSettings = normalizePersistedSettings(await deps.getUiSettings(input.pool, input.data.userId ?? undefined));
  const parsedFeedCache = new Map<string, ParsedFeed | null>();
  const syncState = await getFeverSyncStateByAccountId(
    input.pool,
    input.data.accountId,
    input.data.userId,
  );
  // Fever 增量同步不会自然收敛历史漂移，因此定期回退到账号级全量校正。
  const runFullSync = shouldRunFullSync(syncState?.lastFullSyncAt, now);
  const sinceItemId = runFullSync ? null : syncState?.lastIncrementalItemId ?? null;
  // 全量校正时用当前已知最高 item 作为窗口上界，避免无限制放大单次抓取范围。
  const maxItemId = runFullSync ? resolveHighestKnownItemId(syncState) : null;
  try {
    const result = await syncFeverAccount(input.pool, {
      accountId: input.data.accountId,
      userId: input.data.userId ?? undefined,
      client,
      sinceItemId,
      maxItemId,
      reconcileMissingItems: runFullSync,
      hasFullItemSnapshot: false,
      // Fever 仍由独立 worker 编排，但文章内容统一回到 RSS XML 解析与清洗链路。
      // 单点刷新 Fever feed 也必须升级成账号级同步，不能再做 feed 级 scoped sync。
      resolveArticleProjection: async ({ remoteFeed, localFeed, remoteItem }) => {
        const parsed = await loadParsedFeedSnapshot(
          deps,
          appSettings,
          remoteFeed,
          parsedFeedCache,
          localFeed.userId,
        );
        if (!parsed) {
          return null;
        }

        const matched = matchParsedItem(remoteItem, parsed.items);
        if (!matched) {
          return null;
        }

        const baseUrl = matched.link ?? parsed.link ?? localFeed.url;
        return {
          title: matched.title || remoteItem.title || '(untitled)',
          link: matched.link ?? remoteItem.url ?? null,
          author: matched.author ?? remoteItem.author ?? null,
          publishedAt: matched.publishedAt.toISOString(),
          contentHtml: deps.sanitizeContent(matched.contentHtml, { baseUrl }),
          summary: matched.summary,
          sourceLanguage: parsed.language,
          previewImageUrl: matched.previewImage,
          mediaAttachments: mapMediaAttachments(matched.mediaAttachments),
          isPodcastSource: matched.mediaAttachments.length > 0,
        };
      },
      onArticleCreated: async ({ articleId, feed }) => {
        const filterJob = toArticleFilterJobData(feed, uiSettings.rss.articleFilter);
        await input.boss.send(
          JOB_ARTICLE_FILTER,
          { ...filterJob, userId: feed.userId, articleId },
          getQueueSendOptions(JOB_ARTICLE_FILTER, { userId: feed.userId, articleId }),
        );
      },
    });
    const latestRemoteItemId = resolveLatestRemoteItemId(result.items);
    await upsertFeverSyncState(input.pool, {
      userId: input.data.userId,
      accountId: input.data.accountId,
      lastIncrementalItemId: latestRemoteItemId ?? sinceItemId,
      lastIncrementalSyncedAt: now.toISOString(),
      lastFullSyncAt: runFullSync ? now.toISOString() : undefined,
      lastError: null,
    });
  } catch (error) {
    await upsertFeverSyncState(input.pool, {
      userId: input.data.userId,
      accountId: input.data.accountId,
      lastError: error instanceof Error && error.message.trim()
        ? error.message
        : 'Fever 同步失败，请稍后重试',
    });
    throw error;
  }
}
