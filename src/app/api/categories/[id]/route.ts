import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/infra/http/errors';
import {
  deleteCategory,
  updateCategory,
} from '@/server/domains/feeds/repositories/categoriesRepo';
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
    name: z.string().trim().min(1).optional(),
    position: z.number().int().min(0).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

// 兼容 0034_multi_user 迁移前后的分类名唯一索引。
const categoryNameUniqueConstraints = new Set([
  'categories_user_name_unique',
  'categories_name_unique',
]);

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(
  err: unknown,
  constraints: ReadonlySet<string>,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (
      !('constraint' in err) ||
      (
        typeof (err as { constraint?: unknown }).constraint === 'string' &&
        constraints.has((err as { constraint: string }).constraint)
      )
    )
  );
}

const patchOperationSource = 'app/api/categories/[id]';
const deleteOperationSource = 'app/api/categories/[id]';

async function writeCategoryUpdateFailure(
  err: unknown,
  userId?: string,
  context?: Record<string, unknown>,
) {
  await writeUserOperationFailedLog(getPool(), {
    userId,
    actionKey: 'category.update',
    source: patchOperationSource,
    err,
    context,
  });
}

async function writeCategoryDeleteFailure(
  err: unknown,
  userId?: string,
  context?: Record<string, unknown>,
) {
  await writeUserOperationFailedLog(getPool(), {
    userId,
    actionKey: 'category.delete',
    source: deleteOperationSource,
    err,
    context,
  });
}

export async function PATCH(
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
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeCategoryUpdateFailure(error, session.userId);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error));
      await writeCategoryUpdateFailure(error, session.userId, { categoryId: paramsParsed.data.id });
      return fail(error);
    }

    const pool = getPool();
    const updated = await updateCategory(pool, paramsParsed.data.id, {
      ...bodyParsed.data,
      userId: session.userId,
    });
    if (!updated) {
      const error = new NotFoundError('Category not found');
      await writeCategoryUpdateFailure(error, session.userId, { categoryId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'category.update',
      source: patchOperationSource,
      context: { categoryId: updated.id },
    });
    return ok(updated);
  } catch (err) {
    if (isUniqueViolation(err, categoryNameUniqueConstraints)) {
      const error = new ConflictError('Category already exists', { name: 'duplicate' });
      await writeCategoryUpdateFailure(error, session.userId);
      return fail(error);
    }
    await writeCategoryUpdateFailure(err, session.userId);
    return fail(err);
  }
}

export async function DELETE(
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
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeCategoryDeleteFailure(error, session.userId);
      return fail(error);
    }

    const pool = getPool();
    const deleted = await deleteCategory(pool, paramsParsed.data.id, session.userId);
    if (!deleted) {
      const error = new NotFoundError('Category not found');
      await writeCategoryDeleteFailure(error, session.userId, { categoryId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'category.delete',
      source: deleteOperationSource,
      context: { categoryId: paramsParsed.data.id },
    });

    return ok({ deleted: true });
  } catch (err) {
    await writeCategoryDeleteFailure(err, session.userId);
    return fail(err);
  }
}
