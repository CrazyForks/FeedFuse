import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { reorderCategories } from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const reorderBodySchema = z.object({
  items: z
    .array(
      z.object({
        id: numericIdSchema,
        position: z.number().int().min(0),
      }),
    )
    .min(1),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

const operationSource = 'app/api/categories/reorder';

async function writeCategoryReorderFailure(
  err: unknown,
  userId?: string,
  context?: Record<string, unknown>,
) {
  await writeUserOperationFailedLog(getPool(), {
    userId,
    actionKey: 'category.reorder',
    source: operationSource,
    err,
    context,
  });
}

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = reorderBodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeCategoryReorderFailure(error, session.userId);
      return fail(error);
    }

    const ids = parsed.data.items.map((item) => item.id);
    const positions = parsed.data.items.map((item) => item.position);

    if (new Set(ids).size !== ids.length || new Set(positions).size !== positions.length) {
      const error = new ValidationError('Duplicate ids or positions', { items: 'duplicate' });
      await writeCategoryReorderFailure(error, session.userId);
      return fail(error);
    }

    const sorted = [...positions].sort((a, b) => a - b);
    if (!sorted.every((value, index) => value === index)) {
      const error = new ValidationError('Positions must be contiguous from 0', {
        items: 'non_contiguous',
      });
      await writeCategoryReorderFailure(error, session.userId);
      return fail(error);
    }

    const pool = getPool();
    const rows = await reorderCategories(pool, parsed.data.items, session.userId);
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'category.reorder',
      source: operationSource,
      context: { categoryCount: rows.length },
    });
    return ok(rows);
  } catch (error) {
    await writeCategoryReorderFailure(error, session.userId);
    return fail(error);
  }
}
