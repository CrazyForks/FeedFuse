import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { cleanupAiRuntimeState } from '@/server/integrations/ai/cleanupAiRuntimeState';
import {
  hasAiCleanupScopes,
  resolveAiCleanupScopesForInputs,
} from '@/server/integrations/ai/configFingerprints';
import { writeSystemLog } from '@/server/infra/logging/systemLogger';
import {
  writeUserOperationFailedLog,
  writeUserOperationSucceededLog,
} from '@/server/infra/logging/userOperationLogger';
import { pruneAllFeedsArticlesToLimit } from '@/server/domains/articles/repositories/articlesRepo';
import {
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
  updateUiSettings,
} from '@/server/domains/settings/repositories/settingsRepo';
import { updateAllFeedsFetchIntervalMinutes } from '@/server/domains/feeds/repositories/feedsRepo';
import { normalizePersistedSettings } from '../../../features/settings/settingsSchema';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const raw = await getUiSettings(pool, session.userId);
    return ok(normalizePersistedSettings(raw));
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  const pool = getPool();

  try {
    const json = await request.json().catch(() => null);
    const next = normalizePersistedSettings(json);

    const [prevRaw, aiApiKey, translationApiKey] = await Promise.all([
      getUiSettings(pool, session.userId),
      getAiApiKey(pool, session.userId),
      getTranslationApiKey(pool, session.userId),
    ]);
    const prev = normalizePersistedSettings(prevRaw);

    const client = await pool.connect();

    try {
      await client.query('begin');
      const saved = await updateUiSettings(client, session.userId, next);
      const normalizedSaved = normalizePersistedSettings(saved);

      if (prev.rss.fetchIntervalMinutes !== next.rss.fetchIntervalMinutes) {
        // 订阅抓取间隔属于当前用户的订阅集合，必须按 userId 限定更新范围。
        await updateAllFeedsFetchIntervalMinutes(client, next.rss.fetchIntervalMinutes, session.userId);
      }

      if (prev.rss.maxStoredArticlesPerFeed !== normalizedSaved.rss.maxStoredArticlesPerFeed) {
        // 文章留存上限只应裁剪当前用户的数据，避免串改其他账号内容。
        await pruneAllFeedsArticlesToLimit(
          client,
          normalizedSaved.rss.maxStoredArticlesPerFeed,
          session.userId,
        );
      }

      const nextLogging = normalizedSaved.logging;
      if (!prev.logging.enabled && nextLogging.enabled) {
        await writeSystemLog(
          client,
          {
            level: 'info',
            category: 'settings',
            message: 'Logging enabled',
            source: 'app/api/settings',
            context: { retentionDays: nextLogging.retentionDays },
          },
          { forceWrite: true },
        );
      } else if (prev.logging.enabled && !nextLogging.enabled) {
        await writeSystemLog(
          client,
          {
            level: 'info',
            category: 'settings',
            message: 'Logging disabled',
            source: 'app/api/settings',
            context: { retentionDays: nextLogging.retentionDays },
          },
          { forceWrite: true },
        );
      } else if (
        nextLogging.enabled &&
        prev.logging.retentionDays !== nextLogging.retentionDays
      ) {
        await writeSystemLog(client, {
          level: 'info',
          category: 'settings',
          message: 'Log retention days updated',
          source: 'app/api/settings',
          context: { retentionDays: nextLogging.retentionDays },
        }, undefined);
      }

      await writeUserOperationSucceededLog(client, {
        userId: session.userId,
        actionKey: 'settings.save',
        source: 'app/api/settings',
      });

      await client.query('commit');
      const cleanupScopes = resolveAiCleanupScopesForInputs({
        previous: {
          settings: prev,
          aiApiKey,
          translationApiKey,
        },
        next: {
          settings: normalizedSaved,
          aiApiKey,
          translationApiKey,
        },
      });
      if (hasAiCleanupScopes(cleanupScopes)) {
        await cleanupAiRuntimeState({
          pool,
          scopes: cleanupScopes,
        });
      }
      return ok(normalizedSaved);
    } catch (err) {
      await client.query('rollback');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    await writeUserOperationFailedLog(pool, {
      userId: session.userId,
      actionKey: 'settings.save',
      source: 'app/api/settings',
      err,
    });
    return fail(err);
  }
}
