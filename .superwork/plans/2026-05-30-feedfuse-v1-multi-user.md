# FeedFuse v1 Multi-User Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superwork-executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add single-instance multi-user support with local password login, admin-managed users, user-scoped data, user-scoped settings/secrets, namespaced frontend storage, and migrated single-user history under `admin`.

**Suggested Spec Reads:**
- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists.
- `.superwork/spec/guides/change-boundaries.md` — route/service/repository and worker boundaries.
- `.superwork/spec/guides/verification.md` — required validation commands by touched layer.
- `.superwork/spec/backend/index.md` — backend scope and verification checklist.
- `.superwork/spec/backend/structure.md` — route, service, repository, migration, and worker placement rules.
- `.superwork/spec/backend/quality.md` — backend test and migration requirements.
- `.superwork/spec/backend/contracts.md` — backend API, data, Fever, AI, and queue contracts.
- `.superwork/spec/frontend/index.md` — frontend scope and verification checklist.
- `.superwork/spec/frontend/structure.md` — settings/auth UI placement rules.
- `.superwork/spec/frontend/quality.md` — frontend testing requirements.
- `.superwork/spec/frontend/contracts.md` — API client, settings, reader, and Fever UI contracts.
- `.superwork/spec/shared/index.md` — shared type/API helper boundaries.
- `.superwork/spec/shared/structure.md` — shared module placement rules.
- `.superwork/spec/shared/quality.md` — shared helper/type test rules.

**Architecture:** Add explicit `user_id` ownership columns and pass authenticated `userId` through route, service, repository, worker, and log boundaries. Move login credentials to `users`, move UI settings and API keys to `user_settings`, and keep existing global `app_settings` only as a migration/compatibility source. Add minimal auth/user APIs and frontend state isolation keyed by `userId`.

**Tech Stack:** Next.js route handlers, TypeScript, PostgreSQL SQL migrations, `pg`, `zod`, `ky`, Zustand, Vitest, pnpm.

---

### Task 1: Database Migration

**Files:**

- Create: `src/server/infra/db/migrations/0034_multi_user.sql`
- Test: `src/test/server/db/migrations/multiUserMigration.test.ts`

- [x] **Step 1: Write migration contract tests**

Create `src/test/server/db/migrations/multiUserMigration.test.ts` with assertions that the migration contains:

```ts
import { readFileSync } from 'node:fs';

describe('multi-user migration', () => {
  const sql = readFileSync('src/server/infra/db/migrations/0034_multi_user.sql', 'utf8');

  it('creates users and user_settings', () => {
    expect(sql).toContain('create table if not exists users');
    expect(sql).toContain("role text not null default 'member'");
    expect(sql).toContain("status text not null default 'active'");
    expect(sql).toContain('session_version int not null default 1');
    expect(sql).toContain('create table if not exists user_settings');
  });

  it('backfills admin and single-user data ownership', () => {
    expect(sql).toContain("values ('admin'");
    expect(sql).toContain("where username = 'admin'");
    expect(sql).toContain('update categories set user_id =');
    expect(sql).toContain('update feeds set user_id =');
    expect(sql).toContain('update articles set user_id =');
  });

  it('adds user_id to user-private tables', () => {
    for (const table of [
      'categories',
      'feeds',
      'articles',
      'fever_accounts',
      'fever_feed_mappings',
      'fever_item_mappings',
      'fever_sync_states',
      'ai_digest_configs',
      'ai_digest_runs',
      'feed_refresh_runs',
      'feed_refresh_run_items',
      'article_tasks',
      'article_translation_sessions',
      'article_translation_segments',
      'article_translation_events',
      'article_ai_summary_sessions',
      'article_ai_summary_events',
      'article_media_attachments',
      'feed_favicons',
      'ai_digest_run_sources',
      'system_logs',
    ]) {
      expect(sql).toContain(`alter table ${table}`);
      expect(sql).toContain('add column if not exists user_id bigint');
    }
  });

  it('replaces global unique indexes with user-scoped indexes', () => {
    expect(sql).toContain('drop index if exists categories_name_unique');
    expect(sql).toContain('categories_user_name_unique');
    expect(sql).toContain('drop index if exists feeds_url_unique');
    expect(sql).toContain('feeds_user_url_unique');
    expect(sql).toContain('fever_accounts_user_base_url_username_unique');
    expect(sql).toContain('ai_digest_runs_user_feed_window_unique');
  });
});
```

- [x] **Step 2: Run the migration test and see it fail**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/multiUserMigration.test.ts`

Expected: FAIL because `0034_multi_user.sql` does not exist.

- [x] **Step 3: Add `0034_multi_user.sql`**

Create a migration that:

```sql
create table if not exists users (
  id bigint generated by default as identity primary key,
  username text not null,
  password_hash text not null default '',
  role text not null default 'member',
  status text not null default 'active',
  session_version int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_role_check check (role in ('admin', 'member')),
  constraint users_status_check check (status in ('active', 'disabled'))
);

create unique index if not exists users_username_unique on users (lower(username));

insert into users (username, password_hash, role, status)
select
  'admin',
  coalesce((select auth_password_hash from app_settings where id = 1), ''),
  'admin',
  'active'
where not exists (select 1 from users where lower(username) = 'admin');

create table if not exists user_settings (
  user_id bigint primary key references users(id) on delete cascade,
  ui_settings jsonb not null default '{}'::jsonb,
  ai_api_key text not null default '',
  translation_api_key text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into user_settings (user_id, ui_settings, ai_api_key, translation_api_key)
select
  users.id,
  coalesce((select ui_settings from app_settings where id = 1), '{}'::jsonb),
  coalesce((select ai_api_key from app_settings where id = 1), ''),
  coalesce((select translation_api_key from app_settings where id = 1), '')
from users
where users.username = 'admin'
on conflict (user_id) do nothing;
```

Then add `user_id`, backfill it from `admin`, enforce `not null`, and add indexes for all tables listed in Step 1. Child tables should backfill from parents where possible, for example `articles` from `feeds`, `article_tasks` from `articles`, and `feed_refresh_run_items` from `feed_refresh_runs`.

- [x] **Step 4: Run the migration test**

Run: `pnpm test:unit -- --run src/test/server/db/migrations/multiUserMigration.test.ts`

Expected: PASS.

### Task 2: User Repository And Auth Services

**Files:**

- Create: `src/server/domains/auth/repositories/usersRepo.ts`
- Modify: `src/server/domains/auth/services/session.ts`
- Modify: `src/server/domains/settings/repositories/settingsRepo.ts`
- Test: `src/test/server/auth/session.test.ts`
- Test: `src/test/server/repositories/usersRepo.test.ts`

- [x] **Step 1: Add repository tests**

Add tests that verify user SQL includes lowercased username lookup, admin fallback insert/update, status/session version updates, and user settings creation.

- [x] **Step 2: Implement `usersRepo.ts`**

Expose:

```ts
export type UserRole = 'admin' | 'member';
export type UserStatus = 'active' | 'disabled';
export interface UserRow {
  id: string;
  username: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  sessionVersion: number;
  createdAt: string;
  updatedAt: string;
}
```

Implement `findUserByUsername`, `getUserById`, `createUser`, `listUsers`, `setUserStatus`, `resetUserPassword`, `changeUserPassword`, `ensureUserSettings`, and `persistInitialAdminPassword`.

- [x] **Step 3: Upgrade session token tests**

Update `src/test/server/auth/session.test.ts` to expect `createSessionToken` and `verifySessionToken` to carry `userId`, `role`, and `sessionVersion`.

- [x] **Step 4: Update session service**

Change `SessionPayload` to include `userId`, `role`, and `sessionVersion`. Make `requireApiSession()` return `{ userId, role, sessionVersion }` on success or a fail response on failure. Keep test bypass returning a stable admin-like context.

- [x] **Step 5: Move auth password verification to users**

Replace `verifyPasswordAgainstAuthConfig(password)` with `verifyUserPassword({ username, password })`. It should allow `admin + AUTH_INITIAL_PASSWORD` only when the `admin` user has an empty `password_hash`, then persist the hash.

### Task 3: Auth And User API Routes

**Files:**

- Modify: `src/app/api/auth/login/route.ts`
- Create: `src/app/api/auth/me/route.ts`
- Create: `src/app/api/users/route.ts`
- Create: `src/app/api/users/[id]/route.ts`
- Create: `src/app/api/users/me/password/route.ts`
- Modify: `src/app/api/settings/auth/password/route.ts`
- Modify: `src/lib/api/apiClient.ts`
- Test: `src/test/app/api/auth/login/routes.test.ts`
- Test: `src/test/app/api/users/routes.test.ts`

- [x] **Step 1: Write route tests**

Cover username/password login, `GET /api/auth/me`, admin-only user list/create, admin reset/disable/enable, and self password change.

- [x] **Step 2: Implement routes**

Use `requireApiSession()` for authenticated routes and a small `requireAdminSession()` helper in `session.ts` or each route. Return `403` with `ForbiddenError` for member access to admin routes.

- [x] **Step 3: Update API client**

Add `getCurrentUser`, `listUsers`, `createUser`, `updateUser`, and `changeOwnPassword`. Change `login` input to `{ username: string; password: string }`.

### Task 4: User-Scoped Settings And Keys

**Files:**

- Modify: `src/server/domains/settings/repositories/settingsRepo.ts`
- Modify: `src/app/api/settings/route.ts`
- Modify: `src/app/api/settings/ai/api-key/route.ts`
- Modify: `src/app/api/settings/translation/api-key/route.ts`
- Test: `src/test/server/repositories/settingsRepo.test.ts`
- Test: `src/test/app/api/settings/routes.test.ts`

- [x] **Step 1: Update repository tests**

Expect `getUiSettings`, `updateUiSettings`, `getAiApiKey`, and translation key methods to take `userId` and query `user_settings`.

- [x] **Step 2: Update settings repository**

Read and write `user_settings` by `user_id`. Keep `getAuthSettings` only where still needed for session secret compatibility; new auth should use users.

- [x] **Step 3: Update settings API routes**

Pass `session.userId` to settings/key repository calls.

### Task 5: Repository User Isolation

**Files:**

- Modify: `src/server/domains/feeds/repositories/categoriesRepo.ts`
- Modify: `src/server/domains/feeds/repositories/feedsRepo.ts`
- Modify: `src/server/domains/articles/repositories/articlesRepo.ts`
- Modify: `src/server/domains/articles/repositories/articleTasksRepo.ts`
- Modify: `src/server/domains/articles/repositories/articleAiSummaryRepo.ts`
- Modify: `src/server/domains/articles/repositories/articleTranslationRepo.ts`
- Modify: `src/server/domains/ai-digests/repositories/aiDigestRepo.ts`
- Modify: `src/server/domains/feeds/repositories/feedRefreshRunRepo.ts`
- Modify: `src/server/domains/fever/repositories/feverAccountsRepo.ts`
- Modify: `src/server/domains/fever/repositories/feverMappingsRepo.ts`
- Modify: `src/server/domains/fever/repositories/feverSyncStatesRepo.ts`
- Modify: `src/server/domains/settings/repositories/systemLogsRepo.ts`
- Tests: matching `src/test/server/repositories/**/*.test.ts`

- [x] **Step 1: Update repository tests for scoped SQL**

For each repository touched, add or update assertions that SQL contains `user_id` filters or user-scoped joins and that method calls pass `userId`.

- [x] **Step 2: Add `userId` method parameters**

Add `userId` to list/get/create/update/delete methods that access user-private resources.

- [x] **Step 3: Add SQL ownership filters**

Filter direct owner tables with `where user_id = $n`. For child tables, filter through direct `user_id` columns and parent joins where necessary.

- [x] **Step 4: Update unique violation constraint handling**

Routes should check new user-scoped constraint names such as `categories_user_name_unique`, `feeds_user_url_unique`, and `fever_accounts_user_base_url_username_unique`.

### Task 6: Services, Routes, And Reader Snapshot

**Files:**

- Modify: all user-private routes in `src/app/api/**/route.ts`
- Modify: `src/server/domains/reader/services/readerSnapshotService.ts`
- Modify: `src/server/domains/feeds/services/*.ts`
- Modify: `src/server/domains/fever/services/*.ts`
- Modify: `src/server/domains/ai-digests/services/*.ts`
- Modify: `src/server/domains/articles/services/*.ts`
- Modify: `src/server/domains/settings/services/*.ts`
- Tests: matching route/service tests

- [x] **Step 1: Replace boolean auth guard usage**

Change the pattern:

```ts
const authResponse = await requireApiSession();
if (authResponse) return authResponse;
```

to:

```ts
const session = await requireApiSession();
if ('response' in session) return session.response;
```

or the exact helper shape implemented in Task 2.

- [x] **Step 2: Pass `session.userId` through all calls**

Every route touching user-private data passes `session.userId` into service/repository methods.

- [x] **Step 3: Update service boundaries**

Service inputs that coordinate repositories should include `userId`, and all internal repository calls should use it.

### Task 7: Queue Payloads, Worker Ownership, And Logs

**Files:**

- Modify: `src/server/infra/queue/contracts.ts`
- Modify: `src/worker/index.ts`
- Modify: `src/worker/*.ts`
- Modify: `src/server/infra/logging/systemLogger.ts`
- Modify: `src/server/infra/logging/userOperationLogger.ts`
- Modify: `src/server/domains/settings/repositories/systemLogsRepo.ts`
- Tests: matching worker/logging/queue tests

- [x] **Step 1: Add queue contract tests**

Assert `feed.fetch`, `article.fetch_fulltext`, `article.filter`, `ai.summarize_article`, `ai.translate_article_zh`, `ai.translate_title_zh`, `ai.digest_generate`, and `feed.refresh_all` singleton keys include `userId` when their send context contains one. Assert `fever.sync` uses `${userId}:${accountId}` when both values are present.

- [x] **Step 2: Add `userId` to payload types**

Update send contexts and worker job payload parsing for feed, Fever, AI digest, article AI/fulltext/filter tasks.

- [x] **Step 3: Validate ownership in workers**

Worker handlers use `userId` to fetch resources and no-op/fail cleanly when the resource is not owned by that user.

- [x] **Step 4: Carry userId in logs**

User operation logs and async task logs include `userId`; log list endpoints filter by current user.

### Task 8: Frontend Auth, Storage Namespace, And User Management UI

**Files:**

- Modify: `src/features/auth/components/LoginPage.tsx`
- Create: `src/store/authStore.ts`
- Modify: `src/store/settingsStore.ts`
- Modify: `src/store/appStore.ts`
- Modify: `src/features/settings/**`
- Modify: `src/lib/api/apiClient.ts`
- Tests: `src/test/features/auth/LoginPage.test.tsx`, `src/test/store/*.test.ts`, settings UI tests

- [x] **Step 1: Update login UI tests**

Expect username and password fields and `{ username, password }` login input.

- [x] **Step 2: Add auth store**

Store current user from login/`/api/auth/me`, expose `currentUser`, `setCurrentUser`, and `clearCurrentUser`.

- [x] **Step 3: Namespace localStorage keys**

Use `feedfuse-settings:${userId}` and `feedfuse.reader.unreadOnlyByView.v1:${userId}`. Keep a safe anonymous key only before user profile is known.

- [x] **Step 4: Add minimal settings UI**

Add profile/password controls for all users and user management controls for admins.

### Task 9: Verification And Follow-Up Specs

**Files:**

- Modify if needed: `.superwork/spec/backend/contracts.md`
- Modify if needed: `.superwork/spec/frontend/contracts.md`

- [x] **Step 1: Run targeted tests**

Run targeted tests for changed auth, migration, repositories, routes, stores, and workers.

- [x] **Step 2: Run project checks**

Run:

```bash
pnpm lint
pnpm type-check
pnpm test:unit
```

Run `pnpm build` if route/runtime or app entry behavior changes require it.

- [x] **Step 3: Decide spec updates**

If implementation finalizes new long-term auth/user isolation contracts, update backend/frontend specs. Otherwise record `no-update`.
