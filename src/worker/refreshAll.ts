import { isFeedDue } from '@/worker/rssScheduler';

export interface RefreshAllFeedRow {
  id: string;
  userId?: string;
  fetchIntervalMinutes: number;
  lastFetchedAt: string | null;
}

export function selectFeedsForRefreshAll(
  feeds: RefreshAllFeedRow[],
  now: Date,
  input: { force: boolean },
): RefreshAllFeedRow[] {
  if (input.force) return feeds;

  return feeds.filter((feed) =>
    isFeedDue(
      { lastFetchedAt: feed.lastFetchedAt, fetchIntervalMinutes: feed.fetchIntervalMinutes },
      now,
    ),
  );
}

export function buildFeedFetchJobData(
  feedId: string,
  input: { userId?: string; force: boolean; runId?: string },
): { userId?: string; feedId: string; force?: true; runId?: string } {
  return {
    ...(input.userId ? { userId: input.userId } : {}),
    feedId,
    ...(input.force ? { force: true } : {}),
    ...(input.runId ? { runId: input.runId } : {}),
  };
}
