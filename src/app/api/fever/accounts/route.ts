import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import {
  createFeverAccount,
  listFeverAccounts,
} from '@/server/domains/fever/repositories/feverAccountsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const accounts = await listFeverAccounts(getPool());
    return ok(
      accounts.map((account) => {
        const sanitized = { ...account } as Omit<typeof account, 'apiKey'> & { apiKey?: string };
        delete sanitized.apiKey;
        return sanitized;
      }),
    );
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    const account = await createFeverAccount(getPool(), parsed.data);
    const sanitized = { ...account } as Omit<typeof account, 'apiKey'> & { apiKey?: string };
    delete sanitized.apiKey;
    return ok(sanitized);
  } catch (err) {
    return fail(err);
  }
}
