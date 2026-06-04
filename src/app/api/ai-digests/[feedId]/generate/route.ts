import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { resolveAiConfigFingerprints } from '@/server/integrations/ai/configFingerprints';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getAiApiKey, getUiSettings } from '@/server/domains/settings/repositories/settingsRepo';
import {
  createAiDigestRun,
  getAiDigestConfigByFeedId,
  getAiDigestRunByFeedIdAndWindowStartAt,
  updateAiDigestRun,
} from '@/server/domains/ai-digests/repositories/aiDigestRepo';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { JOB_AI_DIGEST_GENERATE } from '@/server/infra/queue/jobs';
import { writeUserOperationStartedLog } from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  feedId: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ feedId: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const parsedParams = paramsSchema.safeParse(params);
    if (!parsedParams.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsedParams.error)));
    }

    const pool = getPool();
    const [aiApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool, session.userId),
      getUiSettings(pool, session.userId),
    ]);
    if (!aiApiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }
    const { shared: sharedConfigFingerprint } = resolveAiConfigFingerprints({
      settings: uiSettings,
      aiApiKey,
      translationApiKey: '',
    });

    const feedId = parsedParams.data.feedId;
    const config = await getAiDigestConfigByFeedId(pool, feedId, session.userId);
    if (!config) return fail(new NotFoundError('AI digest config not found'));

    const windowStartAt = config.lastWindowEndAt;
    const windowEndAt = new Date().toISOString();

    const existing = await getAiDigestRunByFeedIdAndWindowStartAt(pool, {
      feedId,
      windowStartAt,
      userId: session.userId,
    });
    if (existing && (existing.status === 'queued' || existing.status === 'running')) {
      await writeUserOperationStartedLog(pool, {
        userId: session.userId,
        actionKey: 'aiDigest.generate',
        source: 'app/api/ai-digests/[feedId]/generate',
        context: { feedId, runId: existing.id },
      });
      return ok({ enqueued: false, reason: 'already_running', runId: existing.id });
    }

    const created =
      (existing && existing.status === 'failed') ? existing : await createAiDigestRun(pool, {
        userId: session.userId,
        feedId,
        windowStartAt,
        windowEndAt,
        status: 'queued',
      });

    if (!created) {
      const again = await getAiDigestRunByFeedIdAndWindowStartAt(pool, {
        feedId,
        windowStartAt,
        userId: session.userId,
      });
      if (again && (again.status === 'queued' || again.status === 'running')) {
        await writeUserOperationStartedLog(pool, {
          userId: session.userId,
          actionKey: 'aiDigest.generate',
          source: 'app/api/ai-digests/[feedId]/generate',
          context: { feedId, runId: again.id },
        });
        return ok({ enqueued: false, reason: 'already_running', runId: again.id });
      }
      if (!again) throw new Error('Failed to create or load ai digest run');
      // allow manual retry for failed
      if (again.status !== 'failed') {
        await writeUserOperationStartedLog(pool, {
          userId: session.userId,
          actionKey: 'aiDigest.generate',
          source: 'app/api/ai-digests/[feedId]/generate',
          context: { feedId, runId: again.id },
        });
        return ok({ enqueued: false, reason: 'already_running', runId: again.id });
      }
    }

    const runId = created
      ? created.id
      : (await getAiDigestRunByFeedIdAndWindowStartAt(pool, {
          feedId,
          windowStartAt,
          userId: session.userId,
        }))!.id;

    const payload = { userId: session.userId, runId, sharedConfigFingerprint };
    const enqueueResult = await enqueueWithResult(
      JOB_AI_DIGEST_GENERATE,
      payload,
      getQueueSendOptions(JOB_AI_DIGEST_GENERATE, payload),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_running', runId });
    }

    await updateAiDigestRun(pool, runId, {
      jobId: enqueueResult.jobId,
      status: 'queued',
      errorCode: null,
      errorMessage: null,
      userId: session.userId,
    });
    await writeUserOperationStartedLog(pool, {
      userId: session.userId,
      actionKey: 'aiDigest.generate',
      source: 'app/api/ai-digests/[feedId]/generate',
      context: { feedId, runId },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId, runId });
  } catch (err) {
    return fail(err);
  }
}
