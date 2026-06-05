import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { normalizePersistedSettings } from '../../../../../features/settings/settingsSchema';
import { evaluateArticleBodyTranslationEligibility } from '@/server/integrations/ai/articleTranslationEligibility';
import { resolveAiConfigFingerprints } from '@/server/integrations/ai/configFingerprints';
import {
  isTranslationConfigComplete,
  resolveTranslationConfig,
} from '@/server/integrations/ai/translationConfig';
import { extractImmersiveSegments, hashSourceHtml } from '@/server/integrations/ai/immersiveTranslationSession';
import {
  getArticleById,
  listArticleMediaAttachments,
  type ArticleRow,
} from '@/server/domains/articles/repositories/articlesRepo';
import {
  deleteTranslationEventsBySessionId,
  deleteTranslationSegmentsBySessionId,
  getTranslationSessionByArticleId,
  listTranslationSegmentsBySessionId,
  upsertTranslationSegment,
  upsertTranslationSession,
} from '@/server/domains/articles/repositories/articleTranslationRepo';
import {
  getArticleTasksByArticleId,
  type ArticleTaskRow,
  upsertTaskQueued,
} from '@/server/domains/articles/repositories/articleTasksRepo';
import {
  getFeedBodyTranslateEnabled,
  getFeedFullTextOnOpenEnabled,
} from '@/server/domains/feeds/repositories/feedsRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
} from '@/server/domains/settings/repositories/settingsRepo';
import { writeUserOperationStartedLog } from '@/server/infra/logging/userOperationLogger';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { JOB_AI_TRANSLATE } from '@/server/infra/queue/jobs';
import {
  getUsableFulltextHtml,
  isFulltextPending,
} from '@/server/integrations/fulltext/fulltextVerification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});
const bodySchema = z.object({
  force: z.boolean().optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function getArticleHtmlSource(article: ArticleRow): string {
  return getUsableFulltextHtml(article) ?? article.contentHtml ?? '';
}

function buildSessionSnapshot(
  session: Awaited<ReturnType<typeof getTranslationSessionByArticleId>>,
) {
  if (!session) return null;
  return {
    id: session.id,
    articleId: session.articleId,
    sourceHtmlHash: session.sourceHtmlHash,
    status: session.status,
    totalSegments: session.totalSegments,
    translatedSegments: session.translatedSegments,
    failedSegments: session.failedSegments,
    rawErrorMessage: session.rawErrorMessage,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    updatedAt: session.updatedAt,
  };
}

function isAiTranslateTaskActive(task: ArticleTaskRow | undefined): boolean {
  if (!task) return true;
  return task.status === 'queued' || task.status === 'running';
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authSession = await requireApiSession();
  if (authSession && 'response' in authSession) {
    return authSession.response;
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
    const pool = getPool();

    const article = await getArticleById(pool, articleId, authSession.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const translationSession = await getTranslationSessionByArticleId(
      pool,
      articleId,
      authSession.userId,
    );
    if (!translationSession) {
      return ok({ session: null, segments: [] });
    }

    const segments = await listTranslationSegmentsBySessionId(
      pool,
      translationSession.id,
      translationSession.userId,
    );
    return ok({
      session: buildSessionSnapshot(translationSession),
      segments: segments.map((segment) => ({
        id: segment.id,
        segmentIndex: segment.segmentIndex,
        sourceText: segment.sourceText,
        translatedText: segment.translatedText,
        status: segment.status,
        errorCode: segment.errorCode,
        errorMessage: segment.errorMessage,
        rawErrorMessage: segment.rawErrorMessage,
        updatedAt: segment.updatedAt,
      })),
    });
  } catch (err) {
    return fail(err);
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
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
    const pool = getPool();
    const bodyParsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    const force = bodyParsed.success ? Boolean(bodyParsed.data.force) : false;

    const article = await getArticleById(pool, articleId, session.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    // 播客文章不进入正文翻译链路。
    const mediaAttachments = await listArticleMediaAttachments(pool, articleId, session.userId);
    if (mediaAttachments.length > 0) {
      return ok({ enqueued: false, reason: 'podcast_article' });
    }

    const usableFulltextHtml = getUsableFulltextHtml(article);

    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: usableFulltextHtml,
      summary: article.summary,
    });
    if (!eligibility.bodyTranslationEligible) {
      return ok({ enqueued: false, reason: 'source_is_simplified_chinese' });
    }

    const [aiApiKey, translationApiKey, uiSettings] = await Promise.all([
      getAiApiKey(pool, session.userId),
      getTranslationApiKey(pool, session.userId),
      getUiSettings(pool, session.userId),
    ]);
    const normalizedSettings = normalizePersistedSettings(uiSettings);
    const translationConfig = resolveTranslationConfig({
      settings: normalizedSettings,
      aiApiKey,
      translationApiKey,
    });

    if (!translationConfig.apiKey.trim()) {
      return ok({ enqueued: false, reason: 'missing_api_key' });
    }
    if (!isTranslationConfigComplete(translationConfig)) {
      return ok({ enqueued: false, reason: 'missing_ai_config' });
    }
    const { translation: translationConfigFingerprint } = resolveAiConfigFingerprints({
      settings: uiSettings,
      aiApiKey,
      translationApiKey,
    });

    const feedBodyTranslateEnabled = await getFeedBodyTranslateEnabled(
      pool,
      article.feedId,
      session.userId,
    );
    if (!force && feedBodyTranslateEnabled !== true) {
      return ok({ enqueued: false, reason: 'body_translate_disabled' });
    }

    if (
      !force &&
      (article.aiTranslationBilingualHtml?.trim() || article.aiTranslationZhHtml?.trim())
    ) {
      return ok({ enqueued: false, reason: 'already_translated' });
    }

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(
      pool,
      article.feedId,
      session.userId,
    );
    if (isFulltextPending(article, fullTextOnOpenEnabled)) {
      return ok({ enqueued: false, reason: 'fulltext_pending' });
    }

    const sourceHtml = getArticleHtmlSource(article);
    const sourceHtmlHash = hashSourceHtml(sourceHtml);
    const existingSession = await getTranslationSessionByArticleId(pool, articleId, session.userId);

    if (
      existingSession &&
      existingSession.status === 'running' &&
      existingSession.sourceHtmlHash === sourceHtmlHash
    ) {
      const taskRows = await getArticleTasksByArticleId(pool, articleId, session.userId);
      const aiTranslateTask = taskRows.find((task) => task.type === 'ai_translate');
      if (isAiTranslateTaskActive(aiTranslateTask)) {
        return ok({
          enqueued: false,
          reason: 'already_enqueued',
          sessionId: existingSession.id,
        });
      }
    }

    const segments = extractImmersiveSegments(sourceHtml);
    if (existingSession) {
      await deleteTranslationSegmentsBySessionId(pool, existingSession.id, session.userId);
      await deleteTranslationEventsBySessionId(pool, existingSession.id, session.userId);
    }

    const translationSession = await upsertTranslationSession(pool, {
      userId: session.userId,
      articleId,
      sourceHtmlHash,
      status: 'running',
      totalSegments: segments.length,
      translatedSegments: 0,
      failedSegments: 0,
      rawErrorMessage: null,
    });

    for (const segment of segments) {
      await upsertTranslationSegment(pool, {
        userId: session.userId,
        sessionId: translationSession.id,
        segmentIndex: segment.segmentIndex,
        sourceText: segment.text,
        translatedText: null,
        status: 'pending',
        errorCode: null,
        errorMessage: null,
        rawErrorMessage: null,
      });
    }

    const enqueueResult = await enqueueWithResult(
      JOB_AI_TRANSLATE,
      { userId: session.userId, articleId, translationConfigFingerprint },
      getQueueSendOptions(JOB_AI_TRANSLATE, {
        userId: session.userId,
        articleId,
        force,
      }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false, reason: 'already_enqueued' });
    }

    await upsertTaskQueued(pool, {
      userId: session.userId,
      articleId,
      type: 'ai_translate',
      jobId: enqueueResult.jobId,
    });

    await writeUserOperationStartedLog(pool, {
      userId: session.userId,
      actionKey: 'article.aiTranslate.generate',
      source: 'app/api/articles/[id]/ai-translate',
      context: {
        articleId,
        sessionId: translationSession.id,
        jobId: enqueueResult.jobId,
      },
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId, sessionId: translationSession.id });
  } catch (err) {
    return fail(err);
  }
}
