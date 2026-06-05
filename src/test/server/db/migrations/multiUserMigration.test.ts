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
    expect(sql).toContain('update system_logs set user_id =');
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
