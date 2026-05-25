import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { numericIdSchema } from '@/server/infra/http/idSchemas';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '@/server/infra/http/errors';
import { isSafeExternalUrl } from '@/server/integrations/rss/ssrfGuard';
import {
  deleteFeedAndCleanupCategory,
  updateFeedWithCategoryResolution,
} from '@/server/domains/feeds/services/feedCategoryLifecycleService';
import { getFeedById } from '@/server/domains/feeds/repositories/feedsRepo';
import { normalizeFeedAutoTriggerFlags } from '@/lib/feeds/feedAutoTriggerPolicy';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const feedUrlSafetyOptions = { allowUnresolvedHostname: true } as const;

const paramsSchema = z.object({
  id: numericIdSchema,
});

const categoryInputShape = {
  categoryId: numericIdSchema.nullable().optional(),
  categoryName: z.string().trim().min(1).nullable().optional(),
};

const patchBodySchema = z
  .object({
    title: z.string().trim().min(1).optional(),
    url: z.string().trim().min(1).url().optional(),
    siteUrl: z.string().trim().url().nullable().optional(),
    enabled: z.boolean().optional(),
    ...categoryInputShape,
    fullTextOnOpenEnabled: z.boolean().optional(),
    fullTextOnFetchEnabled: z.boolean().optional(),
    aiSummaryOnOpenEnabled: z.boolean().optional(),
    aiSummaryOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnFetchEnabled: z.boolean().optional(),
    bodyTranslateOnOpenEnabled: z.boolean().optional(),
    titleTranslateEnabled: z.boolean().optional(),
    bodyTranslateEnabled: z.boolean().optional(),
    articleListDisplayMode: z.enum(['card', 'list']).optional(),
  })
  .refine((value) => !(value.categoryId && value.categoryName), {
    path: ['categoryName'],
    message: 'categoryId and categoryName are mutually exclusive',
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'At least one field must be provided',
    path: ['body'],
  });

function zodIssuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'body';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

function isForeignKeyViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23503' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

function isUniqueViolation(
  err: unknown,
  constraint: string,
): err is { code: string; constraint?: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code?: unknown }).code === '23505' &&
    (!('constraint' in err) || (err as { constraint?: unknown }).constraint === constraint)
  );
}

const patchOperationSource = 'app/api/feeds/[id]';
const deleteOperationSource = 'app/api/feeds/[id]';

function validateFeverManagedFeedMutation(
  existingFeed: Awaited<ReturnType<typeof getFeedById>>,
  input: Record<string, unknown>,
) {
  if (!existingFeed || existingFeed.provider !== 'fever') {
    return null;
  }

  const forbiddenFields = ['title', 'url', 'siteUrl', 'categoryId', 'categoryName'];
  const touchedForbiddenFields = forbiddenFields.filter((field) => typeof input[field] !== 'undefined');
  if (touchedForbiddenFields.length === 0) {
    return null;
  }

  const fields: Record<string, string> = {};
  touchedForbiddenFields.forEach((field) => {
    fields[field] = 'Fever 托管源不支持修改该字段';
  });
  return new ValidationError('Invalid request body', fields);
}

function resolveFeedPatchActionKey(input: Record<string, unknown>) {
  const keys = Object.keys(input);
  if (keys.length === 1 && keys[0] === 'enabled' && typeof input.enabled === 'boolean') {
    return input.enabled ? 'feed.enable' : 'feed.disable';
  }
  if (
    keys.length > 0 &&
    keys.every((key) => key === 'categoryId' || key === 'categoryName')
  ) {
    return 'feed.moveToCategory';
  }
  if (keys.length === 1 && keys[0] === 'articleListDisplayMode') {
    return 'feed.articleListDisplayMode.update';
  }
  return 'feed.update';
}

async function writeFeedPatchFailure(
  actionKey: ReturnType<typeof resolveFeedPatchActionKey>,
  err: unknown,
  context?: Record<string, unknown>,
) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey,
    source: patchOperationSource,
    err,
    context,
  });
}

async function writeFeedDeleteFailure(err: unknown, context?: Record<string, unknown>) {
  await writeUserOperationFailedLog(getPool(), {
    actionKey: 'feed.delete',
    source: deleteOperationSource,
    err,
    context,
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  let actionKey: ReturnType<typeof resolveFeedPatchActionKey> = 'feed.update';

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }

    const json = await request.json().catch(() => null);
    const bodyParsed = patchBodySchema.safeParse(json);
    if (!bodyParsed.success) {
      const error = new ValidationError('Invalid request body', zodIssuesToFields(bodyParsed.error));
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    actionKey = resolveFeedPatchActionKey(bodyParsed.data);
    if (
      typeof bodyParsed.data.url !== 'undefined' &&
      !(await isSafeExternalUrl(bodyParsed.data.url, feedUrlSafetyOptions))
    ) {
      const error = new ValidationError('Invalid request body', {
        url: '当前网络环境不允许访问该链接',
      });
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }

    const input = normalizeFeedAutoTriggerFlags({
      ...bodyParsed.data,
    });

    const pool = getPool();
    const existingFeed = await getFeedById(pool, paramsParsed.data.id);
    const managedFeedMutationError = validateFeverManagedFeedMutation(existingFeed, input);
    if (managedFeedMutationError) {
      await writeFeedPatchFailure(actionKey, managedFeedMutationError, { feedId: paramsParsed.data.id });
      return fail(managedFeedMutationError);
    }
    const updated = await updateFeedWithCategoryResolution(pool, paramsParsed.data.id, input);
    if (!updated) {
      const error = new NotFoundError('Feed not found');
      await writeFeedPatchFailure(actionKey, error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey,
      source: patchOperationSource,
      context: { feedId: updated.id },
    });
    return ok(updated);
  } catch (err) {
    if (isUniqueViolation(err, 'feeds_url_unique')) {
      const error = new ConflictError('Feed already exists', { url: 'duplicate' });
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }
    if (isForeignKeyViolation(err, 'feeds_category_id_fkey')) {
      const error = new ValidationError('Invalid request body', { categoryId: 'not_found' });
      await writeFeedPatchFailure(actionKey, error);
      return fail(error);
    }
    await writeFeedPatchFailure(actionKey, err);
    return fail(err);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const authResponse = await requireApiSession();
  if (authResponse) {
    return authResponse;
  }

  try {
    const params = await context.params;
    const paramsParsed = paramsSchema.safeParse(params);
    if (!paramsParsed.success) {
      const error = new ValidationError('Invalid route params', zodIssuesToFields(paramsParsed.error));
      await writeFeedDeleteFailure(error);
      return fail(error);
    }

    const pool = getPool();
    const existingFeed = await getFeedById(pool, paramsParsed.data.id);
    if (existingFeed?.provider === 'fever') {
      const error = new ValidationError('Invalid request body', { id: 'Fever 托管源不支持从此入口删除' });
      await writeFeedDeleteFailure(error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    const deleted = await deleteFeedAndCleanupCategory(pool, paramsParsed.data.id);
    if (!deleted) {
      const error = new NotFoundError('Feed not found');
      await writeFeedDeleteFailure(error, { feedId: paramsParsed.data.id });
      return fail(error);
    }
    await writeUserOperationSucceededLog(pool, {
      actionKey: 'feed.delete',
      source: deleteOperationSource,
      context: { feedId: paramsParsed.data.id },
    });

    return ok({ deleted: true });
  } catch (err) {
    await writeFeedDeleteFailure(err);
    return fail(err);
  }
}
