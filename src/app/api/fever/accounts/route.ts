import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import {
  createFeverAccount,
  deleteFeverAccount,
  listFeverAccounts,
  type FeverAccountRow,
  updateFeverAccountAutoSyncSettings,
} from '@/server/domains/fever/repositories/feverAccountsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
});

const patchBodySchema = z.object({
  id: z.string().trim().min(1),
  autoSyncEnabled: z.boolean(),
  autoSyncIntervalMinutes: z.number().int().min(5).max(1440),
});

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function sanitizeFeverAccount(account: FeverAccountRow) {
  const sanitized = { ...account } as Omit<typeof account, 'apiKey'> & { apiKey?: string };
  delete sanitized.apiKey;
  return sanitized;
}

export async function GET() {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const accounts = await listFeverAccounts(getPool());
    return ok(accounts.map((account) => sanitizeFeverAccount(account)));
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
    return ok(sanitizeFeverAccount(account));
  } catch (err) {
    return fail(err);
  }
}

export async function PATCH(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    const account = await updateFeverAccountAutoSyncSettings(getPool(), {
      accountId: parsed.data.id,
      autoSyncEnabled: parsed.data.autoSyncEnabled,
      autoSyncIntervalMinutes: parsed.data.autoSyncIntervalMinutes,
    });
    if (!account) {
      return fail(new ValidationError('Invalid request body', { id: 'Fever 账号不存在' }));
    }

    return ok(sanitizeFeverAccount(account));
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE(request: Request) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const accountId = new URL(request.url).searchParams.get('id')?.trim() ?? '';
    if (!accountId) {
      return fail(new ValidationError('Invalid request query', { id: '缺少 Fever 账号 id' }));
    }

    await deleteFeverAccount(getPool(), accountId);
    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
