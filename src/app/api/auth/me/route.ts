import { fail, ok } from '@/server/infra/http/apiResponse';
import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { getUserById } from '@/server/domains/auth/repositories/usersRepo';
import { UnauthorizedError } from '@/server/infra/http/errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireApiSession();
  if ('response' in session) {
    return session.response;
  }

  const user = await getUserById(getPool(), session.userId);
  if (!user || user.status !== 'active') {
    return fail(new UnauthorizedError('请先登录后再继续'));
  }

  return ok({
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status,
    sessionVersion: user.sessionVersion,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
}
