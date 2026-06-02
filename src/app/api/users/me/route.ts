import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/infra/http/errors';
import {
  createSessionCookieHeader,
  requireApiSession,
} from '@/server/domains/auth/services/session';
import { hashPassword } from '@/server/domains/auth/services/password';
import { updateUser } from '@/server/domains/auth/repositories/usersRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchCurrentUserBodySchema = z.object({
  username: z.string().trim().min(1, '请输入用户名'),
  nextPassword: z.string().optional().default(''),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505'
  );
}

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = patchCurrentUserBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('用户信息校验失败', zodIssuesToFields(parsed.error));
    }

    const normalizedNextPassword = parsed.data.nextPassword.trim();
    const shouldChangePassword = normalizedNextPassword.length > 0;

    let passwordHash: string | undefined;
    if (shouldChangePassword) {
      if (normalizedNextPassword.length < 8) {
        throw new ValidationError('密码校验失败', {
          nextPassword: '新密码至少需要 8 位',
        });
      }

      passwordHash = hashPassword(normalizedNextPassword);
    }

    // 当前账号自助入口统一保存用户名与密码，角色和状态仍保持后端只读。
    const user = await updateUser(getPool(), {
      userId: session.userId,
      username: parsed.data.username,
      passwordHash,
    });
    if (!user) {
      throw new NotFoundError('用户不存在');
    }

    return ok(
      user,
      shouldChangePassword
        ? {
            headers: {
              'set-cookie': await createSessionCookieHeader({
                userId: user.id,
                role: user.role,
                sessionVersion: user.sessionVersion ?? session.sessionVersion,
              }),
            },
          }
        : undefined,
    );
  } catch (err) {
    if (isUniqueViolation(err)) {
      return fail(new ConflictError('用户名已存在', { username: 'duplicate' }));
    }
    return fail(err);
  }
}
