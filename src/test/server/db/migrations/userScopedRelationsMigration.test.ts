import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('user scoped relations migration', () => {
  const migrationPath = 'src/server/infra/db/migrations/0036_user_scoped_relations.sql';

  it('adds user-scoped uniqueness for async task and mapping tables', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('article_tasks_user_article_type_unique');
    expect(sql).toContain('feed_refresh_run_items_user_run_feed_unique');
    expect(sql).toContain('fever_feed_mappings_user_account_feed_unique');
    expect(sql).toContain('fever_item_mappings_user_account_item_unique');
    expect(sql).toContain('fever_sync_states_user_account_unique');
  });

  it('adds database guards for cross-user relation writes', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toContain('ensure_user_scoped_relations()');
    expect(sql).toContain('article task must belong to same user as article');
    expect(sql).toContain('feed refresh run item must belong to same user as run and feed');
    expect(sql).toContain('fever mapping must belong to same user as account and local feed');
    expect(sql).toContain('ai digest source must belong to same user as run and article');
  });
});
