import { ok } from '@/server/infra/http/apiResponse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return ok({ status: 'ok' });
}

