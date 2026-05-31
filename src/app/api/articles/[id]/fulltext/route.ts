import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  getArticleById,
  listArticleMediaAttachments,
} from '@/server/domains/articles/repositories/articlesRepo';
import { upsertTaskQueued } from '@/server/domains/articles/repositories/articleTasksRepo';
import { getFeedFullTextOnOpenEnabled } from '@/server/domains/feeds/repositories/feedsRepo';
import { getQueueSendOptions } from '@/server/infra/queue/contracts';
import { enqueueWithResult } from '@/server/infra/queue/queue';
import { JOB_ARTICLE_FULLTEXT_FETCH } from '@/server/infra/queue/jobs';
import { getUsableFulltextHtml } from '@/server/integrations/fulltext/fulltextVerification';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: numericIdSchema,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function htmlToText(html: string): string {
  return normalizeWhitespace(
    html
      .replace(/&nbsp;|&#160;/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  );
}

function rssContentLooksFull(contentHtml: string | null, summary: string | null): boolean {
  if (!contentHtml) return false;

  const text = htmlToText(contentHtml);
  if (!text) return false;

  if (/(read more|continue reading)/i.test(text)) return false;
  if (/阅读全文|继续阅读|阅读更多|更多内容/i.test(text)) return false;

  const textLen = text.length;
  const paragraphCount = (contentHtml.match(/<p[\s>]/gi) ?? []).length;

  const summaryText = typeof summary === 'string' ? normalizeWhitespace(summary) : '';
  const summaryLen = summaryText.length;

  if (textLen >= 2000) return true;
  if (paragraphCount >= 5 && textLen >= 800) return true;
  if (summaryLen > 0 && textLen >= Math.max(1200, summaryLen * 4)) return true;

  return false;
}

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
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

    const json = await request.json().catch(() => null);
    const force = Boolean(isRecord(json) && json.force === true);

    const articleId = paramsParsed.data.id;
    const pool = getPool();
    const article = await getArticleById(pool, articleId, session.userId);
    if (!article) return fail(new NotFoundError('Article not found'));

    // 播客文章只保留播放能力，不触发全文抓取。
    const mediaAttachments = await listArticleMediaAttachments(pool, articleId, session.userId);
    if (mediaAttachments.length > 0) return ok({ enqueued: false, reason: 'podcast_article' });

    const fullTextOnOpenEnabled = await getFeedFullTextOnOpenEnabled(
      pool,
      article.feedId,
      session.userId,
    );
    if (!force && fullTextOnOpenEnabled !== true) {
      return ok({ enqueued: false });
    }

    if (!article.link) return ok({ enqueued: false });
    if (getUsableFulltextHtml(article)) return ok({ enqueued: false });
    if (rssContentLooksFull(article.contentHtml, article.summary)) return ok({ enqueued: false });

    const enqueueResult = await enqueueWithResult(
      JOB_ARTICLE_FULLTEXT_FETCH,
      { userId: session.userId, articleId },
      getQueueSendOptions(JOB_ARTICLE_FULLTEXT_FETCH, {
        userId: session.userId,
        articleId,
      }),
    );
    if (enqueueResult.status !== 'enqueued') {
      return ok({ enqueued: false });
    }

    await upsertTaskQueued(pool, {
      userId: session.userId,
      articleId,
      type: 'fulltext',
      jobId: enqueueResult.jobId,
    });
    return ok({ enqueued: true, jobId: enqueueResult.jobId });
  } catch (err) {
    return fail(err);
  }
}
