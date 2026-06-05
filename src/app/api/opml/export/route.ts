import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { fail } from '@/server/infra/http/apiResponse';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { exportOpml } from '@/server/domains/settings/services/opmlService';

export async function GET() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const result = await exportOpml(pool, session.userId);
    await writeUserOperationSucceededLog(pool, {
      userId: session.userId,
      actionKey: 'opml.export',
      source: 'app/api/opml/export',
      context: { fileName: result.fileName },
    });

    return new Response(result.xml, {
      status: 200,
      headers: {
        'content-type': 'application/xml; charset=utf-8',
        'content-disposition': `attachment; filename="${result.fileName}"`,
      },
    });
  } catch (error) {
    await writeUserOperationFailedLog(getPool(), {
      userId: session.userId,
      actionKey: 'opml.export',
      source: 'app/api/opml/export',
      err: error,
    });
    return fail(error);
  }
}
