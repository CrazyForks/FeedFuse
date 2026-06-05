import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { getFeedRefreshRunById } from '@/server/domains/feeds/repositories/feedRefreshRunRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  runId: numericIdSchema,
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'params';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ runId: string }> },
) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const parsed = paramsSchema.safeParse(params);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid route params', zodIssuesToFields(parsed.error)));
    }

    const run = await getFeedRefreshRunById(getPool(), parsed.data.runId, session.userId);
    if (!run) {
      return fail(new NotFoundError('Feed refresh run not found'));
    }

    return ok({
      id: run.id,
      scope: run.scope,
      status: run.status,
      feedId: run.feedId,
      totalCount: run.totalCount,
      succeededCount: run.succeededCount,
      failedCount: run.failedCount,
      errorMessage: run.errorMessage,
      updatedAt: run.updatedAt,
      finishedAt: run.finishedAt,
    });
  } catch (err) {
    return fail(err);
  }
}
