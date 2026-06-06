import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { UnauthorizedError, ValidationError } from '@/server/infra/http/errors';
import { createSessionCookieHeader, requireApiSession } from '@/server/domains/auth/services/session';
import { hashPassword, verifyPassword } from '@/server/domains/auth/services/password';
import { changeUserPassword, getUserById } from '@/server/domains/auth/repositories/usersRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const changeOwnPasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  nextPassword: z.string().min(8),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = changeOwnPasswordBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('密码校验失败', {
        currentPassword: '请输入当前密码',
        nextPassword: '新密码至少需要 8 位',
      });
    }
    if (parsed.data.currentPassword === parsed.data.nextPassword) {
      throw new ValidationError('新密码不能与当前密码相同', {
        nextPassword: '请设置不同的新密码',
      });
    }

    const user = await getUserById(getPool(), session.userId);
    if (!user || !verifyPassword(parsed.data.currentPassword, user.passwordHash)) {
      throw new UnauthorizedError('当前密码错误，请重试');
    }

    const updated = await changeUserPassword(getPool(), {
      userId: session.userId,
      passwordHash: hashPassword(parsed.data.nextPassword),
    });

    const sessionCookie = await createSessionCookieHeader({
      userId: user.id,
      role: user.role,
      sessionVersion: updated?.sessionVersion ?? session.sessionVersion,
    });

    return ok(
      { updated: Boolean(updated) },
      {
        headers: {
          'set-cookie': sessionCookie,
        },
      },
    );
  } catch (err) {
    return fail(err);
  }
}
