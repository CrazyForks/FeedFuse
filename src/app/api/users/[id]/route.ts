import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ForbiddenError, NotFoundError, ValidationError } from '@/server/infra/http/errors';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { hashPassword } from '@/server/domains/auth/services/password';
import { resetUserPassword, setUserStatus } from '@/server/domains/auth/repositories/usersRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchUserBodySchema = z.object({
  status: z.enum(['active', 'disabled']).optional(),
  password: z.string().trim().min(8).optional(),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

async function requireAdmin() {
  const session = await requireApiSession();
  if ('response' in session) {
    return session;
  }
  if (session.role !== 'admin') {
    return { response: fail(new ForbiddenError()) };
  }
  return session;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if ('response' in session) {
    return session.response;
  }

  try {
    const params = await context.params;
    const parsedId = numericIdSchema.safeParse(params.id);
    if (!parsedId.success) {
      throw new ValidationError('用户 ID 无效', { id: 'Invalid numeric id' });
    }

    const json = await request.json().catch(() => null);
    const parsed = patchUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    let user = null;
    if (parsed.data.status) {
      user = await setUserStatus(getPool(), {
        userId: parsedId.data,
        status: parsed.data.status,
      });
    }
    if (parsed.data.password) {
      user = await resetUserPassword(getPool(), {
        userId: parsedId.data,
        passwordHash: hashPassword(parsed.data.password),
      });
    }
    if (!user) {
      throw new NotFoundError('用户不存在');
    }

    return ok(user);
  } catch (err) {
    return fail(err);
  }
}
