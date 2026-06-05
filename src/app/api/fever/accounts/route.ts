import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ConflictError, ValidationError } from '@/server/infra/http/errors';
import {
  createFeverAccount,
  getFeverAccountById,
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

// 兼容 0034_multi_user 迁移前后的 Fever 账号唯一索引。
const feverAccountUniqueConstraints = new Set([
  'fever_accounts_user_base_url_username_unique',
  'fever_accounts_base_url_username_unique',
]);

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isUniqueViolation(
  err: unknown,
  constraints: ReadonlySet<string>,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (
      !('constraint' in err) ||
      (
        typeof (err as { constraint?: unknown }).constraint === 'string' &&
        constraints.has((err as { constraint: string }).constraint)
      )
    )
  );
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
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    // 多账号场景必须显式绑定当前用户作用域，避免回退到默认管理员数据。
    const accounts = await listFeverAccounts(getPool(), session.userId);
    return ok(accounts.map((account) => sanitizeFeverAccount(account)));
  } catch (err) {
    return fail(err);
  }
}

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    // 保存前先校验凭据和服务可用性，避免把错误配置写成“成功”状态。
    await verifyFeverAccountConnection(parsed.data);
    const account = await createFeverAccount(getPool(), {
      ...parsed.data,
      userId: session.userId,
    });
    return ok(sanitizeFeverAccount(account));
  } catch (err) {
    if (isUniqueViolation(err, feverAccountUniqueConstraints)) {
      return fail(new ConflictError('Fever 账号已存在', {
        baseUrl: 'duplicate',
        username: 'duplicate',
      }));
    }
    return fail(err);
  }
}

export async function PATCH(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = patchBodySchema.safeParse(json);
    if (!parsed.success) {
      return fail(new ValidationError('Invalid request body', zodIssuesToFields(parsed.error)));
    }

    const existing = await getFeverAccountById(getPool(), parsed.data.id, session.userId);
    if (!existing) {
      return fail(new ValidationError('Invalid request body', { id: 'Fever 账号不存在' }));
    }

    const nextApiKey = parsed.data.apiKey.trim() || existing.apiKey;
    const shouldVerifyConnection =
      parsed.data.baseUrl !== existing.baseUrl
      || parsed.data.username !== existing.username
      || parsed.data.apiKey.trim().length > 0;
    if (shouldVerifyConnection) {
      // 编辑时如果未重填 apiKey，也要复用现有凭据校验新连接配置。
      await verifyFeverAccountConnection({
        baseUrl: parsed.data.baseUrl,
        username: parsed.data.username,
        apiKey: nextApiKey,
      });
    }
    const account = await updateFeverAccount(getPool(), {
      accountId: parsed.data.id,
      baseUrl: parsed.data.baseUrl,
      username: parsed.data.username,
      apiKey: parsed.data.apiKey,
      enabled: parsed.data.enabled,
      autoSyncIntervalMinutes: parsed.data.autoSyncIntervalMinutes,
      userId: session.userId,
    });
    if (!account) {
      return fail(new ValidationError('Invalid request body', { id: 'Fever 账号不存在' }));
    }

    return ok(sanitizeFeverAccount(account));
  } catch (err) {
    if (isUniqueViolation(err, feverAccountUniqueConstraints)) {
      return fail(new ConflictError('Fever 账号已存在', {
        baseUrl: 'duplicate',
        username: 'duplicate',
      }));
    }
    return fail(err);
  }
}

export async function DELETE(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const accountId = new URL(request.url).searchParams.get('id')?.trim() ?? '';
    if (!accountId) {
      return fail(new ValidationError('Invalid request query', { id: '缺少 Fever 账号 id' }));
    }

    const deleted = await deleteFeverAccountAndSources(getPool(), accountId, session.userId);
    return ok({ deleted });
  } catch (err) {
    return fail(err);
  }
}
