import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_FEED_FETCH, JOB_FEVER_SYNC } from '@/server/infra/queue/jobs';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { getPool } from '@/server/infra/db/pool';
import {
  completeFeedRefreshRunItem,
  initializeFeedRefreshRun,
} from '@/server/domains/feeds/services/feedRefreshRunService';
import { getFeedRefreshDispatchRow } from '@/server/domains/feeds/repositories/feedsRepo';
import { getFeverAccountById, markFeverAccountSyncAttempted } from '@/server/domains/fever/repositories/feverAccountsRepo';
import { getFeverAccountByLocalFeedId, listActiveLocalFeedIdsByFeverAccountId } from '@/server/domains/fever/repositories/feverMappingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const pool = getPool();
    const feed = await getFeedRefreshDispatchRow(pool, paramsParsed.data.id);
    if (!feed || !feed.enabled || feed.kind !== 'rss') {
      return ok({ enqueued: false });
    }

    if (feed.provider === 'fever') {
      // Fever 源不支持单独刷新，任意一个源入口都直接升级成账号级同步。
      const mapping = await getFeverAccountByLocalFeedId(pool, paramsParsed.data.id);
      if (!mapping) {
        return ok({ enqueued: false });
      }

      const account = await getFeverAccountById(pool, mapping.feverAccountId);
      if (!account || !account.enabled) {
        return ok({ enqueued: false });
      }

      const targetFeedIds = await listActiveLocalFeedIdsByFeverAccountId(pool, mapping.feverAccountId);
      const run = await initializeFeedRefreshRun(pool, {
        scope: 'single',
        feedId: paramsParsed.data.id,
        targetFeedIds: targetFeedIds.length > 0 ? targetFeedIds : [paramsParsed.data.id],
      });
      const payload = {
        accountId: mapping.feverAccountId,
        runId: run.id,
        feedIds: targetFeedIds.length > 0 ? targetFeedIds : [paramsParsed.data.id],
      };
      const attemptedAt = new Date().toISOString();
      const trackedResult = await enqueueWithResult(
        JOB_FEVER_SYNC,
        payload,
        getQueueSendOptions(JOB_FEVER_SYNC, payload),
      );
      if (trackedResult.status !== 'enqueued') {
        // 重复点击时也要把 run 收口，否则前端会一直看到 queued。
        for (const feedId of payload.feedIds) {
          await completeFeedRefreshRunItem(pool, {
            runId: run.id,
            feedId,
            status: 'failed',
            errorMessage: 'Fever 同步任务已在队列中',
          });
        }
        return ok({ enqueued: false, runId: run.id });
      }
      await markFeverAccountSyncAttempted(pool, {
        accountId: mapping.feverAccountId,
        attemptedAt,
      });
      return ok({ enqueued: true, jobId: trackedResult.jobId, runId: run.id });
    }

    const run = await initializeFeedRefreshRun(getPool(), {
      scope: 'single',
      feedId: paramsParsed.data.id,
      targetFeedIds: [paramsParsed.data.id],
    });
    const payload = { feedId: paramsParsed.data.id, force: true, runId: run.id };
    const result = await enqueueWithResult(
      JOB_FEED_FETCH,
      payload,
      getQueueSendOptions(JOB_FEED_FETCH, payload),
    );
    if (result.status !== 'enqueued') return ok({ enqueued: false, runId: run.id });
    return ok({ enqueued: true, jobId: result.jobId, runId: run.id });
  } catch (err) {
    return fail(err);
  }
}
