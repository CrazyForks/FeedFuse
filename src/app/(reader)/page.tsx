import { redirect } from 'next/navigation';
import { getApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { getUserById } from '@/server/domains/auth/repositories/usersRepo';
import ReaderApp from './ReaderApp';
import type { ViewType } from '../../types';

interface ReaderPageProps {
  searchParams?:
    | Promise<Record<string, string | string[] | undefined>>
    | Record<string, string | string[] | undefined>;
}

function normalizeViewSearchParam(input: string | string[] | undefined): ViewType | undefined {
  const rawValue = Array.isArray(input) ? input[0] : input;
  const normalized = rawValue?.trim();
  return normalized ? normalized : undefined;
}

export default async function ReaderPage({ searchParams }: ReaderPageProps = {}) {
  const session = await getApiSession();
  if (!session) {
    redirect('/login');
  }

  // 服务端已经完成会话校验，直接下发用户信息，避免客户端再次请求 /api/auth/me。
  const user = await getUserById(getPool(), session.userId);
  if (!user || user.status !== 'active') {
    redirect('/login');
  }

  const resolvedSearchParams = searchParams ? await Promise.resolve(searchParams) : undefined;

  return (
    <ReaderApp
      renderedAt={new Date().toISOString()}
      initialSelectedView={normalizeViewSearchParam(resolvedSearchParams?.view)}
      initialCurrentUser={{
        id: user.id,
        username: user.username,
        type: user.type,
        role: user.role,
        status: user.status,
        sessionVersion: user.sessionVersion,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      }}
    />
  );
}
