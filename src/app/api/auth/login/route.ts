import { z } from 'zod';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ServiceUnavailableError, UnauthorizedError, ValidationError } from '@/server/infra/http/errors';
import { AUTH_INITIAL_PASSWORD_SETUP_MESSAGE } from '@/server/domains/auth/services/shared';
import { createSessionCookieHeader, verifyUserPassword } from '@/server/domains/auth/services/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const loginBodySchema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const json = await request.json().catch(() => null);
    const parsed = loginBodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError('登录信息不能为空', {
        username: '请输入用户名',
        password: '请输入密码',
      });
    }

    const result = await verifyUserPassword(parsed.data);
    if (!result.ok) {
      if (result.reason === 'missing_initial_password') {
        throw new ServiceUnavailableError(AUTH_INITIAL_PASSWORD_SETUP_MESSAGE);
      }

      throw new UnauthorizedError('密码错误，请重试');
    }
    if (!result.user) {
      throw new UnauthorizedError('密码错误，请重试');
    }

    return ok(
      {
        authenticated: true,
        user: {
          id: result.user.userId,
          type: result.user.userId === '1' ? 'initial_admin' : result.user.role,
          role: result.user.role,
        },
      },
      {
        headers: {
          'set-cookie': await createSessionCookieHeader(result.user),
        },
      },
    );
  } catch (err) {
    return fail(err);
  }
}
