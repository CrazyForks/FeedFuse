import { requireApiSession } from '@/server/domains/auth/services/session';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_REFRESH_ALL } from '@/server/infra/queue/jobs';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { getPool } from '@/server/infra/db/pool';
import { initializeFeedRefreshRun } from '@/server/domains/feeds/services/feedRefreshRunService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const run = await initializeFeedRefreshRun(getPool(), {
      scope: 'all',
      userId: session.userId,
    });
    const payload = { force: true, runId: run.id, userId: session.userId };
    const result = await enqueueWithResult(
      JOB_REFRESH_ALL,
      payload,
      getQueueSendOptions(JOB_REFRESH_ALL, payload),
    );
    if (result.status !== 'enqueued') return ok({ enqueued: false, runId: run.id });
    return ok({ enqueued: true, jobId: result.jobId, runId: run.id });
  } catch (err) {
    return fail(err);
  }
}
