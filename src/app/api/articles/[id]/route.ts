import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { evaluateArticleBodyTranslationEligibility } from '@/server/integrations/ai/articleTranslationEligibility';
import { getPool } from '@/server/infra/db/pool';
import { getServerEnv } from '@/server/infra/env';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getActiveAiSummarySessionByArticleId } from '@/server/domains/articles/repositories/articleAiSummaryRepo';
import {
  getArticleById,
  listArticleMediaAttachments,
  type ArticleRow,
} from '@/server/domains/articles/repositories/articlesRepo';
import { updateArticleStateWithWriteback } from '@/server/domains/fever/services/feverWritebackService';
import { listAiDigestRunSourcesByArticleId } from '@/server/domains/ai-digests/repositories/aiDigestRepo';
import {
  buildImageProxyUrl,
  getOptionalImageProxySecret,
} from '@/server/integrations/media/imageProxyUrl';
import { rewriteHtmlImages } from '@/server/integrations/media/rewriteHtmlImages';
import { getUsableFulltextHtml } from '@/server/integrations/fulltext/fulltextVerification';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

const patchBodySchema = z
  .object({
    isRead: z.boolean().optional(),
    isStarred: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function htmlContainsImage(html: string | null | undefined): html is string {
  return typeof html === 'string' && /<img\b/i.test(html);
}

function rewriteArticleHtmlFields(article: ArticleRow): ArticleRow {
  const hasImages = [
    article.contentHtml,
    article.contentFullHtml,
    article.aiTranslationBilingualHtml,
    article.aiTranslationZhHtml,
  ].some(htmlContainsImage);

  if (!hasImages) {
    return article;
  }

  const secret = getOptionalImageProxySecret(getServerEnv().IMAGE_PROXY_SECRET);
  if (!secret) {
    return article;
  }

  const rewriteUrl = (sourceUrl: string) => buildImageProxyUrl({ sourceUrl, secret });

  return {
    ...article,
    contentHtml: htmlContainsImage(article.contentHtml)
      ? rewriteHtmlImages(article.contentHtml, rewriteUrl)
      : article.contentHtml,
    contentFullHtml: htmlContainsImage(article.contentFullHtml)
      ? rewriteHtmlImages(article.contentFullHtml, rewriteUrl)
      : article.contentFullHtml,
    aiTranslationBilingualHtml: htmlContainsImage(article.aiTranslationBilingualHtml)
      ? rewriteHtmlImages(article.aiTranslationBilingualHtml, rewriteUrl)
      : article.aiTranslationBilingualHtml,
    aiTranslationZhHtml: htmlContainsImage(article.aiTranslationZhHtml)
      ? rewriteHtmlImages(article.aiTranslationZhHtml, rewriteUrl)
      : article.aiTranslationZhHtml,
  };
}

function buildAiSummarySessionSnapshot(
  session: Awaited<ReturnType<typeof getActiveAiSummarySessionByArticleId>>,
) {
  if (!session) return null;

  return {
    id: session.id,
    status: session.status,
    draftText: session.draftText,
    finalText: session.finalText,
    errorCode: session.errorCode,
    errorMessage: session.errorMessage,
    rawErrorMessage: session.rawErrorMessage,
    startedAt: session.startedAt,
    finishedAt: session.finishedAt,
    updatedAt: session.updatedAt,
  };
}

function mapMediaAttachment(row: Awaited<ReturnType<typeof listArticleMediaAttachments>>[number]) {
  return {
    id: row.id,
    url: row.url,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes === null ? null : Number(row.sizeBytes),
    durationSeconds: row.durationSeconds,
  };
}

function resolvePatchOperation(input: {
  articleId: string;
  isRead?: boolean;
  isStarred?: boolean;
}):
  | {
      actionKey: 'article.markRead' | 'article.toggleStar';
      context: Record<string, unknown>;
    }
  | null {
  if (typeof input.isRead !== 'undefined' && typeof input.isStarred === 'undefined') {
    return {
      actionKey: 'article.markRead',
      context: { articleId: input.articleId },
    };
  }

  if (typeof input.isStarred !== 'undefined' && typeof input.isRead === 'undefined') {
    return {
      actionKey: 'article.toggleStar',
      context: {
        articleId: input.articleId,
        starred: input.isStarred,
      },
    };
  }

  return null;
}

export async function GET(
  _request: Request,
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

    const pool = getPool();
    const article = await getArticleById(pool, paramsParsed.data.id, session.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    const usableFulltextHtml = getUsableFulltextHtml(article);
    const articleWithUsableFulltext =
      usableFulltextHtml === article.contentFullHtml
        ? article
        : { ...article, contentFullHtml: usableFulltextHtml };
    const proxiedArticle = rewriteArticleHtmlFields(articleWithUsableFulltext);
    const [aiSummarySession, aiDigestSources, mediaAttachments] = await Promise.all([
      getActiveAiSummarySessionByArticleId(pool, article.id, session.userId),
      listAiDigestRunSourcesByArticleId(pool, article.id, session.userId),
      listArticleMediaAttachments(pool, article.id, session.userId),
    ]);
    const eligibility = evaluateArticleBodyTranslationEligibility({
      sourceLanguage: article.sourceLanguage,
      contentHtml: article.contentHtml,
      contentFullHtml: usableFulltextHtml,
      summary: article.summary,
    });

    return ok({
      ...proxiedArticle,
      aiSummarySession: buildAiSummarySessionSnapshot(aiSummarySession),
      aiDigestSources,
      mediaAttachments: mediaAttachments.map(mapMediaAttachment),
      bodyTranslationEligible: eligibility.bodyTranslationEligible,
      bodyTranslationBlockedReason: eligibility.bodyTranslationBlockedReason,
    });
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  let operation:
    | {
        actionKey: 'article.markRead' | 'article.toggleStar';
        context: Record<string, unknown>;
      }
    | null = null;

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      return fail(
        new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error)),
      );
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error)));
    }

    const pool = getPool();
    const { isRead, isStarred } = bodyParsed.data;
    operation = resolvePatchOperation({
      articleId: paramsParsed.data.id,
      isRead,
      isStarred,
    });

    await updateArticleStateWithWriteback(pool, {
      articleId: paramsParsed.data.id,
      isRead,
      isStarred,
      userId: session.userId,
      requireRemoteWriteback: true,
    });

    if (operation) {
      await writeUserOperationSucceededLog(pool, {
        userId: session.userId,
        actionKey: operation.actionKey,
        source: 'app/api/articles/[id]',
        context: operation.context,
      });
    }

    return ok({ updated: true });
  } catch (err) {
    if (operation) {
      await writeUserOperationFailedLog(getPool(), {
        userId: session.userId,
        actionKey: operation.actionKey,
        source: 'app/api/articles/[id]',
        err,
        context: operation.context,
      });
    }
    return fail(err);
  }
}
