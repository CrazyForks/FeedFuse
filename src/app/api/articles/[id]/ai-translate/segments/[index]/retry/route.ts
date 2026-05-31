import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getArticleById } from '@/server/domains/articles/repositories/articlesRepo';
import {
  getTranslationSessionByArticleId,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
} from '@/server/domains/articles/repositories/articleTranslationRepo';
import { writeUserOperationStartedLog } from '@/server/infra/logging/userOperationLogger';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { JOB_AI_TRANSLATE } from '@/server/infra/queue/jobs';
import { enqueueWithResult } from '@/server/infra/queue/queue';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
  index: z.coerce.number().int().nonnegative(),
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
  context: { params: Promise<{ id: string; index: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const articleId = paramsParsed.data.id;
    const segmentIndex = paramsParsed.data.index;
    const pool = getPool();

    const article = await getArticleById(pool, articleId, session.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const translationSession = await getTranslationSessionByArticleId(pool, articleId, session.userId);
    if (!translationSession) return fail(new NotFoundError('Translation session not found'));

    const segments = await listTranslationSegmentsBySessionId(
      pool,
      translationSession.id,
      translationSession.userId,
    );
    const segment = segments.find((item) => item.segmentIndex === segmentIndex);
    if (!segment) return fail(new NotFoundError('Translation segment not found'));

    if (segment.status === 'succeeded') {
      return ok({ enqueued: false, reason: 'already_succeeded' });
    }

    if (segment.status !== 'failed') {
      return ok({ enqueued: false, reason: 'segment_not_failed' });
    }

    await upsertTranslationSegment(pool, {
      userId: translationSession.userId,
      sessionId: translationSession.id,
      segmentIndex,
      sourceText: segment.sourceText,
      translatedText: null,
      status: 'pending',
      errorCode: null,
      errorMessage: null,
    });

    const enqueueResult = await enqueueWithResult(
      JOB_AI_TRANSLATE,
      { userId: translationSession.userId, articleId, sessionId: translationSession.id, segmentIndex },
      getQueueSendOptions(JOB_AI_TRANSLATE, {
        userId: translationSession.userId,
        articleId,
        force: true,
      }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued' });
    }

    await writeUserOperationStartedLog(pool, {
      userId: translationSession.userId,
      actionKey: 'article.aiTranslate.retrySegment',
      source: 'app/api/articles/[id]/ai-translate/segments/[index]/retry',
      context: {
        articleId,
        sessionId: translationSession.id,
        segmentIndex,
        jobId: enqueueResult.jobId,
      },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId });
  } catch (err) {
    return fail(err);
  }
}
