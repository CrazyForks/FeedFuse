# FeedFuse v1 Multi-User Design

**Goal:** Implement single-instance multi-user FeedFuse with strict per-user isolation, local password login, admin-managed users, and smooth migration of existing single-user data.

**Suggested Spec Reads:**

- `.superwork/spec/guides/index.md` — shared workflow rules and project-wide checklists.
- `.superwork/spec/guides/change-boundaries.md` — route/service/repository and worker boundary rules.
- `.superwork/spec/guides/verification.md` — required validation commands by touched layer.
- `.superwork/spec/backend/index.md` — backend scope, persistence, API, and worker checklist.
- `.superwork/spec/backend/contracts.md` — backend route, service, repository, migration, queue, Fever, and AI contracts.
- `.superwork/spec/frontend/index.md` — frontend scope and verification checklist.
- `.superwork/spec/frontend/contracts.md` — API client, reader, settings, and Fever UI contracts.
- `.superwork/spec/shared/index.md` — shared type and API helper boundaries.

**Context:**
FeedFuse currently uses a single global password/session model backed by `app_settings.auth_password_hash` and `auth_session_secret`. User-private data is stored in global tables such as `categories`, `feeds`, `articles`, Fever mappings, AI digest tables, and refresh run tables. Frontend persisted settings and reader preferences use global `localStorage` keys. Worker jobs and logs identify resources but do not carry an explicit user context.

**Recommended Approach:**
Use explicit `user_id` columns and `userId` context throughout the application. This matches the current repository/service architecture, keeps local deployment simple, and allows a controlled migration from single-user data to a default `admin` user without introducing PostgreSQL RLS or multi-database complexity.

## Authentication And Users

Create a `users` table with:

- `id`
- `username`
- `password_hash`
- `role` constrained to `admin` or `member`
- `status` constrained to `active` or `disabled`
- `session_version`
- `created_at`
- `updated_at`

The default administrator username is fixed to `admin`. During migration, if `app_settings.auth_password_hash` exists, copy it to `users.password_hash` for `admin`. If it is empty, allow `admin + AUTH_INITIAL_PASSWORD` for first login and write the hashed password into `users.password_hash` after successful login.

Session payload must include:

```ts
{ userId, role, sessionVersion, iat, exp }
```

`requireApiSession()` returns the current user context instead of a boolean/null guard. It verifies token signature, expiry, user existence, `status = 'active'`, and matching `session_version`. Disabled users or users whose `session_version` changed receive `401 unauthorized`.

Password changes and admin resets increment `session_version` so existing sessions are invalidated.

## Data Isolation

Add `user_id not null references users(id)` to all user-private tables explicitly listed by the requirement:

- `categories`
- `feeds`
- `articles`
- `fever_accounts`
- `fever_feed_mappings`
- `fever_item_mappings`
- `fever_sync_states`
- `ai_digest_configs`
- `ai_digest_runs`
- `feed_refresh_runs`

Also update strongly related child tables that can expose or mutate user data through parent resources, including:

- `feed_refresh_run_items`
- `ai_digest_run_sources`
- article task/session/segment tables
- article media attachment tables
- feed favicon tables if persisted independently from `feeds`
- system/user operation log tables where user-visible log filtering depends on ownership

Existing single-user data is migrated to the default `admin` user. Child table `user_id` values must be derived from parent tables in the migration to avoid orphaned ownership.

Uniqueness must become user-scoped:

- `categories`: `(user_id, lower(name))`
- `feeds`: `(user_id, url)` or the existing local RSS partial unique index with `user_id`
- `fever_accounts`: `(user_id, base_url, username)`
- `ai_digest_runs`: `(user_id, feed_id, window_start_at)`
- run/item uniqueness keeps existing resource keys but includes or derives `user_id` where direct lookup may be user-visible

Repository methods must accept `userId` whenever they access user-private resources. Queries should filter by `user_id` directly or join to a user-scoped parent table. Routes should pass the authenticated context into services/repositories rather than appending ad hoc filters.

Cross-user resource access should behave like a missing resource where possible, preserving existing `404` or empty-list behavior and avoiding ID existence leaks.

## Settings And Secrets

Introduce a minimal user-level settings table, such as `user_settings`, with:

- `user_id`
- `ui_settings`
- `ai_api_key`
- `translation_api_key`
- `created_at`
- `updated_at`

Move user-private settings and keys off global `app_settings`. During migration, copy existing `app_settings.ui_settings`, `ai_api_key`, and `translation_api_key` into the `admin` user settings row.

Keep `app_settings` only for global runtime settings and compatibility fields during the transition. Authentication should move to `users`; AI and translation keys should be read from `user_settings` for the current user or the job's `userId`.

## API Surface

Add minimal user APIs:

- `GET /api/auth/me` returns `{ id, username, role, status }`.
- `POST /api/auth/login` accepts `username + password`.
- `GET /api/users` lets admins list users.
- `POST /api/users` lets admins create users.
- `PATCH /api/users/[id]` lets admins enable/disable users or reset passwords.
- `POST /api/users/me/password` lets a user change their own password.

Admin-only endpoints return `403 forbidden` for non-admin users. Keep `/api/settings/auth/password` temporarily as a compatibility wrapper or migrate it to call the new self-password service, so existing UI code can be moved safely.

All existing user-private APIs must call `requireApiSession()` and pass `session.userId` into downstream logic, including reader snapshot, categories, feeds, articles, Fever, AI digest, OPML import/export, logs, settings, key APIs, and refresh-run polling.

## Worker And Logs

Queue payloads must explicitly carry `userId` for user-originated or user-private jobs:

- `feed.fetch`
- `feed.refresh_all`
- `fever.sync`
- `ai.digest_generate`
- article fulltext, filter, AI summary, title translation, body translation jobs

Worker entry points must validate that the resource belongs to `userId` before mutating data. Singleton keys should include `userId` where the logical uniqueness is user-scoped, while preserving existing Fever account-level mutual exclusion by scoping the account ID with user ownership.

Logs must explicitly carry `userId` for user operations and user-private async tasks. System-wide jobs such as cleanup may use `user_id null`, but user-visible log queries must filter to the current user's logs unless the endpoint is intentionally admin-wide.

## Frontend State

The login page adds a username field and posts `{ username, password }`. Login success returns or is followed by `GET /api/auth/me`, and the frontend stores current user metadata in a small auth store.

Local persisted state must be namespaced by `userId`:

- `feedfuse-settings:${userId}`
- `feedfuse.reader.unreadOnlyByView.v1:${userId}`

After login or user switch, settings and reader state must be rehydrated from the current user's API responses. Local state from the previous user must not drive reader snapshot filters, settings, or pending UI state.

Add minimal settings UI for:

- Admin user list.
- Admin create user.
- Admin reset password.
- Admin enable/disable user.
- Current user profile view.
- Current user password change.

The implementation should reuse existing settings modal patterns and API client error handling.

## Error Handling

- Unauthenticated or invalidated session: `401 unauthorized`.
- Disabled user: `401 unauthorized`.
- Non-admin user on admin APIs: `403 forbidden`.
- Cross-user resource access: return existing missing-resource behavior, usually `404` or empty result.
- Duplicate username, duplicate feed URL, duplicate category name, and duplicate Fever account: return conflict errors using the new user-scoped constraint names.

## Testing Strategy

Cover these behaviors at minimum:

- Session payload includes `userId`, `role`, `sessionVersion`, `iat`, and `exp`.
- Disabled users and changed `session_version` invalidate sessions.
- `admin` migration receives existing single-user data.
- Empty legacy auth hash supports first login through `AUTH_INITIAL_PASSWORD` and then persists a user password hash.
- Categories, feeds, articles, Fever accounts/mappings, AI digest config/runs, and feed refresh runs are isolated by `userId`.
- API routes pass `userId` into services/repositories.
- Worker payloads and logs carry `userId`.
- Frontend `localStorage` keys are namespaced by `userId`.

Expected verification:

- Targeted route, repository, service, store, and worker tests.
- `pnpm lint`
- `pnpm type-check`
- `pnpm test:unit`
- `pnpm build` if route/runtime or app entry behavior changes broadly.
