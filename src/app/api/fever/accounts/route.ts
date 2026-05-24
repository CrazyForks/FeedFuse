import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import {
  createFeverAccount,
  listFeverAccounts,
  type FeverAccountRow,
  updateFeverAccount,
} from '@/server/domains/fever/repositories/feverAccountsRepo';
import { deleteFeverAccountAndSources } from '@/server/domains/fever/services/feverAccountLifecycleService';
import { createFeverClient } from '@/server/integrations/fever/feverClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().min(1),
  enabled: z.boolean().optional().default(true),
  autoSyncIntervalMinutes: z.number().int().min(0).max(1440).optional().default(30),
});

const patchBodySchema = z.object({
  id: z.string().trim().min(1),
  baseUrl: z.string().trim().url(),
  username: z.string().trim().min(1),
  apiKey: z.string().trim().optional().default(''),
  enabled: z.boolean(),
  autoSyncIntervalMinutes: z.number().int().min(0).max(1440),
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

async function verifyFeverAccountConnection(input: {
  baseUrl: string;
  username: string;
  apiKey: string;
}) {
  const client = createFeverClient(input);
  await client.listFeeds();
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

    // 保存前先校验凭据和服务可用性，避免把错误配置写成“成功”状态。
    await verifyFeverAccountConnection(parsed.data);
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

    if (parsed.data.apiKey.trim()) {
      await verifyFeverAccountConnection({
        baseUrl: parsed.data.baseUrl,
        username: parsed.data.username,
        apiKey: parsed.data.apiKey,
      });
    }
    const account = await updateFeverAccount(getPool(), {
      accountId: parsed.data.id,
      baseUrl: parsed.data.baseUrl,
      username: parsed.data.username,
      apiKey: parsed.data.apiKey,
      enabled: parsed.data.enabled,
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

    await deleteFeverAccountAndSources(getPool(), accountId);
    return ok({ deleted: true });
  } catch (err) {
    return fail(err);
  }
}
