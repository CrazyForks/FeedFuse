import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ValidationError } from '@/server/infra/http/errors';

const connectMock = vi.fn();
const queryMock = vi.fn();
const releaseMock = vi.fn();

const findCategoryByNormalizedNameMock = vi.fn();
const getNextCategoryPositionMock = vi.fn();
const createCategoryMock = vi.fn();
const createAiDigestFeedMock = vi.fn();
const createAiDigestConfigMock = vi.fn();
const updateFeedMock = vi.fn();
const getFeedCategoryAssignmentMock = vi.fn();
const getAiDigestConfigByFeedIdMock = vi.fn();
const updateAiDigestConfigMock = vi.fn();
const countFeedsByCategoryIdMock = vi.fn();
const deleteCategoryMock = vi.fn();
const getCategoryByIdMock = vi.fn();

vi.mock('@/server/domains/feeds/repositories/categoriesRepo', () => ({
  findCategoryByNormalizedName: (...args: unknown[]) =>
    findCategoryByNormalizedNameMock(...args),
  getNextCategoryPosition: (...args: unknown[]) => getNextCategoryPositionMock(...args),
  createCategory: (...args: unknown[]) => createCategoryMock(...args),
  deleteCategory: (...args: unknown[]) => deleteCategoryMock(...args),
  getCategoryById: (...args: unknown[]) => getCategoryByIdMock(...args),
}));
vi.mock('@/server/domains/feeds/repositories/feedsRepo', () => ({
  createAiDigestFeed: (...args: unknown[]) => createAiDigestFeedMock(...args),
  updateFeed: (...args: unknown[]) => updateFeedMock(...args),
  getFeedCategoryAssignment: (...args: unknown[]) => getFeedCategoryAssignmentMock(...args),
  countFeedsByCategoryId: (...args: unknown[]) => countFeedsByCategoryIdMock(...args),
}));
vi.mock('@/server/domains/ai-digests/repositories/aiDigestRepo', () => ({
  createAiDigestConfig: (...args: unknown[]) => createAiDigestConfigMock(...args),
  getAiDigestConfigByFeedId: (...args: unknown[]) => getAiDigestConfigByFeedIdMock(...args),
  updateAiDigestConfig: (...args: unknown[]) => updateAiDigestConfigMock(...args),
}));

describe('aiDigestLifecycleService', () => {
  beforeEach(() => {
    connectMock.mockReset();
    queryMock.mockReset();
    releaseMock.mockReset();
    findCategoryByNormalizedNameMock.mockReset();
    getNextCategoryPositionMock.mockReset();
    createCategoryMock.mockReset();
    createAiDigestFeedMock.mockReset();
    createAiDigestConfigMock.mockReset();
    updateFeedMock.mockReset();
    getFeedCategoryAssignmentMock.mockReset();
    getAiDigestConfigByFeedIdMock.mockReset();
    updateAiDigestConfigMock.mockReset();
    countFeedsByCategoryIdMock.mockReset();
    deleteCategoryMock.mockReset();
    getCategoryByIdMock.mockReset();

    queryMock.mockResolvedValue(undefined);
    connectMock.mockResolvedValue({
      query: queryMock,
      release: releaseMock,
    });
  });

  it('reuses an existing category when categoryName matches', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue({ id: 'cat-tech' });
    createAiDigestFeedMock.mockResolvedValue({ id: 'feed-1', iconUrl: null });
    createAiDigestConfigMock.mockResolvedValue({ feedId: 'feed-1' });
    updateFeedMock.mockResolvedValue({
      id: 'feed-1',
      iconUrl: '/ai-digest-icon.svg',
    });

    const pool = { connect: connectMock };
    const { createAiDigestWithCategoryResolution } = await import('@/server/domains/ai-digests/services/aiDigestLifecycleService');

    await expect(
      createAiDigestWithCategoryResolution(pool as never, {
        title: 'My Digest',
        prompt: '解读这些文章',
        intervalMinutes: 60,
        selectedFeedIds: [],
        categoryName: 'Tech',
      }),
    ).resolves.toBeTruthy();

    expect(createCategoryMock).not.toHaveBeenCalled();
    expect(createAiDigestFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ categoryId: 'cat-tech' }),
    );
    expect(updateFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      'feed-1',
      expect.objectContaining({ iconUrl: '/ai-digest-icon.svg' }),
    );
    expect(createAiDigestConfigMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        selectedFeedIds: [],
      }),
    );
    expect(createAiDigestConfigMock).not.toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ selectedCategoryIds: expect.anything() }),
    );
  });

  it('creates a new category when categoryName does not exist', async () => {
    findCategoryByNormalizedNameMock.mockResolvedValue(null);
    getNextCategoryPositionMock.mockResolvedValue(3);
    createCategoryMock.mockResolvedValue({ id: 'cat-new' });
    createAiDigestFeedMock.mockResolvedValue({ id: 'feed-1', iconUrl: null });
    createAiDigestConfigMock.mockResolvedValue({ feedId: 'feed-1' });
    updateFeedMock.mockResolvedValue({
      id: 'feed-1',
      iconUrl: '/ai-digest-icon.svg',
    });

    const pool = { connect: connectMock };
    const { createAiDigestWithCategoryResolution } = await import('@/server/domains/ai-digests/services/aiDigestLifecycleService');

    await expect(
      createAiDigestWithCategoryResolution(pool as never, {
        title: 'My Digest',
        prompt: '解读这些文章',
        intervalMinutes: 60,
        selectedFeedIds: [],
        categoryName: 'Tech',
      }),
    ).resolves.toBeTruthy();

    expect(createCategoryMock).toHaveBeenCalled();
    expect(createAiDigestFeedMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ categoryId: 'cat-new' }),
    );
  });

  it('rejects categoryId that does not belong to the current user when creating ai digest', async () => {
    const pool = { connect: connectMock };
    getCategoryByIdMock.mockResolvedValue(null);

    const { createAiDigestWithCategoryResolution } = await import('@/server/domains/ai-digests/services/aiDigestLifecycleService');

    await expect(
      createAiDigestWithCategoryResolution(pool as never, {
        title: 'My Digest',
        prompt: '解读这些文章',
        intervalMinutes: 60,
        selectedFeedIds: [],
        categoryId: 'cat-other-user',
        userId: '2',
      }),
    ).rejects.toEqual(
      new ValidationError('Invalid request body', {
        categoryId: 'not_found',
      }),
    );
  });

  it('rejects categoryId that does not belong to the current user when updating ai digest', async () => {
    const pool = { connect: connectMock };
    getFeedCategoryAssignmentMock.mockResolvedValue({
      id: 'feed-1',
      categoryId: 'cat-old',
    });
    getAiDigestConfigByFeedIdMock.mockResolvedValue({
      feedId: 'feed-1',
      prompt: '旧提示词',
      intervalMinutes: 60,
      selectedFeedIds: [],
    });
    getCategoryByIdMock.mockResolvedValue(null);

    const { updateAiDigestWithCategoryResolution } = await import('@/server/domains/ai-digests/services/aiDigestLifecycleService');

    await expect(
      updateAiDigestWithCategoryResolution(pool as never, {
        feedId: 'feed-1',
        title: 'My Digest',
        prompt: '解读这些文章',
        intervalMinutes: 60,
        selectedFeedIds: [],
        categoryId: 'cat-other-user',
        userId: '2',
      }),
    ).rejects.toEqual(
      new ValidationError('Invalid request body', {
        categoryId: 'not_found',
      }),
    );
  });
});
