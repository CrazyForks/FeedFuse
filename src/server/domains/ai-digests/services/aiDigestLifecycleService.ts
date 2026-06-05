import type { Pool } from 'pg';
import { AI_DIGEST_ICON_URL } from '@/lib/feeds/feedIcons';
import {
  createCategory,
  deleteCategory,
  findCategoryByNormalizedName,
  getCategoryById,
  getNextCategoryPosition,
} from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  countFeedsByCategoryId,
  createAiDigestFeed,
  getFeedCategoryAssignment,
  listFeedsByIds,
  type FeedRow,
  updateFeed,
} from '@/server/domains/feeds/repositories/feedsRepo';
import {
  createAiDigestConfig,
  getAiDigestConfigByFeedId,
  updateAiDigestConfig,
} from '@/server/domains/ai-digests/repositories/aiDigestRepo';
import { normalizeUserId } from '@/server/domains/users/userScope';
import { ValidationError } from '@/server/infra/http/errors';

const LEGACY_AI_DIGEST_RELEVANT_CAP = 500;

type CategoryResolutionInput = {
  categoryId?: string | null;
  categoryName?: string | null;
  userId?: string;
};

function normalizeCategoryName(name: string | null | undefined): string | null {
  const normalized = name?.trim() ?? '';
  if (!normalized || normalized === '未分类') return null;
  return normalized;
}

async function resolveCategoryId(
  client: { query: Pool['query'] },
  input: CategoryResolutionInput,
): Promise<string | null> {
  const userId = normalizeUserId(input.userId);
  if (typeof input.categoryId !== 'undefined') {
    if (input.categoryId === null) {
      return null;
    }

    // 智能报告与普通 feed 一样，不能引用其他用户的分类。
    const category = await getCategoryById(client as never, input.categoryId, userId);
    if (!category) {
      throw new ValidationError('Invalid request body', { categoryId: 'not_found' });
    }
    return category.id;
  }

  const normalizedName = normalizeCategoryName(input.categoryName);
  if (!normalizedName) return null;

  const existing = await findCategoryByNormalizedName(client as never, normalizedName, userId);
  if (existing) return existing.id;

  const position = await getNextCategoryPosition(client as never, userId);
  const created = await createCategory(client as never, { name: normalizedName, position, userId });
  return created.id;
}

async function cleanupCategoryIfEmpty(
  client: { query: Pool['query'] },
  categoryId: string | null | undefined,
  userId?: string,
): Promise<void> {
  if (!categoryId) return;

  const remainingCount = await countFeedsByCategoryId(client as never, categoryId, userId);
  if (remainingCount === 0) {
    await deleteCategory(client as never, categoryId, userId);
  }
}

async function assertSelectedFeedsBelongToUser(
  client: { query: Pool['query'] },
  selectedFeedIds: string[],
  userId: string,
): Promise<void> {
  const uniqueIds = Array.from(new Set(selectedFeedIds));
  const feeds = await listFeedsByIds(client as never, uniqueIds, userId);
  const validIds = new Set(
    feeds
      .filter((feed) => feed.kind === 'rss' && feed.provider === 'local_rss')
      .map((feed) => feed.id),
  );

  // 智能报告只允许选择当前用户自己的本地 RSS 源，避免保存跨账号引用。
  if (uniqueIds.some((id) => !validIds.has(id))) {
    throw new ValidationError('Invalid request body', { selectedFeedIds: 'not_found' });
  }
}

export async function createAiDigestWithCategoryResolution(
  pool: Pool,
  input: {
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
    userId?: string;
  },
) {
  const userId = normalizeUserId(input.userId);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const categoryId = await resolveCategoryId(client as never, { ...input, userId });
    await assertSelectedFeedsBelongToUser(client as never, input.selectedFeedIds, userId);

    const createdFeed = await createAiDigestFeed(client as never, {
      title: input.title,
      categoryId,
      userId,
    });
    // 智能报告使用固定内置图标，创建时直接回写到 feed 记录。
    const createdFeedWithIcon =
      createdFeed.iconUrl === AI_DIGEST_ICON_URL
        ? createdFeed
        : ((await updateFeed(client as never, createdFeed.id, {
            iconUrl: AI_DIGEST_ICON_URL,
            userId,
          })) ?? createdFeed);

    await createAiDigestConfig(client as never, {
      feedId: createdFeed.id,
      prompt: input.prompt,
      intervalMinutes: input.intervalMinutes,
      // 兼容保留 top_n 字段，但实际策略改为“纳入所有判定为相关的候选”。
      topN: LEGACY_AI_DIGEST_RELEVANT_CAP,
      selectedFeedIds: input.selectedFeedIds,
      lastWindowEndAt: new Date().toISOString(),
      userId,
    });

    await client.query('commit');
    return createdFeedWithIcon;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateAiDigestWithCategoryResolution(
  pool: Pool,
  input: {
    feedId: string;
    title: string;
    prompt: string;
    intervalMinutes: number;
    selectedFeedIds: string[];
    categoryId?: string | null;
    categoryName?: string | null;
    userId?: string;
  },
): Promise<FeedRow | null> {
  const userId = normalizeUserId(input.userId);
  const client = await pool.connect();
  try {
    await client.query('begin');

    const [existingFeed, existingConfig] = await Promise.all([
      getFeedCategoryAssignment(client as never, input.feedId, userId),
      getAiDigestConfigByFeedId(client as never, input.feedId, userId),
    ]);
    if (!existingFeed || !existingConfig) {
      await client.query('commit');
      return null;
    }

    const nextCategoryId = await resolveCategoryId(client as never, { ...input, userId });
    await assertSelectedFeedsBelongToUser(client as never, input.selectedFeedIds, userId);

    // 编辑智能报告源时同时更新 feeds 与 ai_digest_configs，确保同事务一致。
    const updatedFeed = await updateFeed(client as never, input.feedId, {
      title: input.title,
      categoryId: nextCategoryId,
      iconUrl: AI_DIGEST_ICON_URL,
      userId,
    });
    if (!updatedFeed) {
      await client.query('commit');
      return null;
    }

    const updatedConfig = await updateAiDigestConfig(client as never, input.feedId, {
      prompt: input.prompt,
      intervalMinutes: input.intervalMinutes,
      topN: LEGACY_AI_DIGEST_RELEVANT_CAP,
      selectedFeedIds: input.selectedFeedIds,
      userId,
    });
    if (!updatedConfig) {
      await client.query('rollback');
      return null;
    }

    if (existingFeed.categoryId !== updatedFeed.categoryId) {
      await cleanupCategoryIfEmpty(client as never, existingFeed.categoryId, userId);
    }

    await client.query('commit');
    return updatedFeed;
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
