import { requireApiSession } from '@/server/domains/auth/services/session';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_FEVER_SYNC } from '@/server/infra/queue/jobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const { id } = await context.params;
    const payload = { accountId: id };
    const result = await enqueueWithResult(
      JOB_FEVER_SYNC,
      payload,
      getQueueSendOptions(JOB_FEVER_SYNC, { feedId: id }),
    );
    if (result.status === 'enqueued') {
      return ok({ queued: true });
    }

    // Fever 同步使用 singletonKey 去重，重复点击时显式返回原因，前端才能给出准确反馈。
    return ok({ queued: false, reason: 'already_enqueued' as const });
  } catch (err) {
    return fail(err);
  }
}
