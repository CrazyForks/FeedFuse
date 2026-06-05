import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('user_id foreign keys migration', () => {
  const migrationPath = 'src/server/infra/db/migrations/0037_user_id_foreign_keys.sql';

  it('guards every user-private table with a users foreign key', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

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
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table ${table} add constraint ${table}_user_id_fkey foreign key \\(user_id\\) references users\\(id\\) on delete cascade;`,
        ),
      );
    }
  });

  it('keeps nullable system logs tied to existing users', () => {
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');

    expect(sql).toMatch(
      /alter table system_logs add constraint system_logs_user_id_fkey foreign key \(user_id\) references users\(id\) on delete set null;/,
    );
  });
});
