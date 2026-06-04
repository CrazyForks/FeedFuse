import { requireApiSession } from '@/server/domains/auth/services/session';
import { getPool } from '@/server/infra/db/pool';
import { cleanupAiRuntimeState } from '@/server/integrations/ai/cleanupAiRuntimeState';
import {
  hasAiCleanupScopes,
  resolveAiCleanupScopesForInputs,
} from '@/server/integrations/ai/configFingerprints';
import { ok, fail } from '@/server/infra/http/apiResponse';
import { ValidationError } from '@/server/infra/http/errors';
import {
  clearAiApiKey,
  getAiApiKey,
  getTranslationApiKey,
  getUiSettings,
  setAiApiKey,
} from '@/server/domains/settings/repositories/settingsRepo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readApiKey(input: unknown): string {
  if (!input || typeof input !== 'object') return '';
  const apiKey = (input as { apiKey?: unknown }).apiKey;
  return typeof apiKey === 'string' ? apiKey : '';
}

export async function GET() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const apiKey = await getAiApiKey(pool, session.userId);
    return ok({ hasApiKey: apiKey.trim().length > 0 });
  } catch (err) {
    return fail(err);
  }
}

export async function PUT(request: Request) {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const json = await request.json().catch(() => null);
    const apiKey = readApiKey(json);
    if (!apiKey.trim()) {
      throw new ValidationError('Invalid API key', { apiKey: 'API key is required.' });
    }

    const pool = getPool();
    const [uiSettings, currentAiApiKey, translationApiKey] = await Promise.all([
      getUiSettings(pool, session.userId),
      getAiApiKey(pool, session.userId),
      getTranslationApiKey(pool, session.userId),
    ]);
    await setAiApiKey(pool, session.userId, apiKey);
    const cleanupScopes = resolveAiCleanupScopesForInputs({
      previous: {
        settings: uiSettings,
        aiApiKey: currentAiApiKey,
        translationApiKey,
      },
      next: {
        settings: uiSettings,
        aiApiKey: apiKey,
        translationApiKey,
      },
    });
    if (hasAiCleanupScopes(cleanupScopes)) {
      await cleanupAiRuntimeState({
        pool,
        userId: session.userId,
        scopes: cleanupScopes,
      });
    }
    return ok({ hasApiKey: true });
  } catch (err) {
    return fail(err);
  }
}

export async function DELETE() {
  const session = await requireApiSession();
  if (session && 'response' in session) {
    return session.response;
  }

  try {
    const pool = getPool();
    const [uiSettings, currentAiApiKey, translationApiKey] = await Promise.all([
      getUiSettings(pool, session.userId),
      getAiApiKey(pool, session.userId),
      getTranslationApiKey(pool, session.userId),
    ]);
    await clearAiApiKey(pool, session.userId);
    const cleanupScopes = resolveAiCleanupScopesForInputs({
      previous: {
        settings: uiSettings,
        aiApiKey: currentAiApiKey,
        translationApiKey,
      },
      next: {
        settings: uiSettings,
        aiApiKey: '',
        translationApiKey,
      },
    });
    if (hasAiCleanupScopes(cleanupScopes)) {
      await cleanupAiRuntimeState({
        pool,
        userId: session.userId,
        scopes: cleanupScopes,
      });
    }
    return ok({ hasApiKey: false });
  } catch (err) {
    return fail(err);
  }
}
