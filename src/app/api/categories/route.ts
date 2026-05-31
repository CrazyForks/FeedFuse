import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ConflictError, ValidationError } from '@/server/infra/http/errors';
import { createCategory, listCategories } from '@/server/domains/feeds/repositories/categoriesRepo';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const createCategoryBodySchema = z.object({
  name: z.string().trim().min(1),
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

const operationSource = 'app/api/categories';

async function writeCategoryCreateFailure(err: unknown, userId?: string) {
  await writeUserOperationFailedLog(getPool(), {
    userId,
    actionKey: 'category.create',
    source: operationSource,
    err,
  });
}

export async function GET() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const categories = await listCategories(pool, session.userId);
    return ok(categories);
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = createCategoryBodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(parsed.error));
      await writeCategoryCreateFailure(error, session.userId);
      return fail(error);
    }

    const pool = getPool();
    const created = await createCategory(pool, { name: parsed.data.name, userId: session.userId });
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'category.create',
      source: operationSource,
      context: { categoryId: created.id },
    });
    return ok(created);
  } catch (err) {
    if (isUniqueViolation(err, categoryNameUniqueConstraints)) {
      const error = new ConflictError('Category already exists', { name: 'duplicate' });
      await writeCategoryCreateFailure(error, session.userId);
      return fail(error);
    }
    await writeCategoryCreateFailure(err, session.userId);
    return fail(err);
  }
}
