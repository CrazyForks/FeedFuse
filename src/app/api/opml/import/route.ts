import { requireApiSession } from '@/server/domains/auth/services/session';
import { z } from 'zod';
import { getPool } from '@/server/infra/db/pool';
import { fail, ok } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { importOpml } from '@/server/domains/settings/services/opmlService';

const bodySchema = z.object({
  content: z.string().trim().min(1),
  fileName: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      const error = new ValidationError('Invalid request body', { content: 'required' });
      await writeUserOperationFailedLog(getPool(), {
        userId: session.userId,
        actionKey: 'opml.import',
        source: 'app/api/opml/import',
        err: error,
      });
      return fail(error);
    }

    const pool = getPool();
    const result = await importOpml(pool, { ...parsed.data, userId: session.userId });
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'opml.import',
      source: 'app/api/opml/import',
      context: {
        importedCount: result.importedCount,
        duplicateCount: result.duplicateCount,
        invalidCount: result.invalidCount,
      },
    });
    return ok(result);
  } catch (error) {
    await writeUserOperationFailedLog(getPool(), {
      userId: session.userId,
      actionKey: 'opml.import',
      source: 'app/api/opml/import',
      err: error,
    });
    return fail(error);
  }
}
