import { ok } from '@/server/infra/http/apiResponse';
import { serializeExpiredSessionCookie } from '@/server/domains/auth/services/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return ok(
    { authenticated: false },
    {
      headers: {
        'set-cookie': serializeExpiredSessionCookie(),
      },
    },
  );
}
