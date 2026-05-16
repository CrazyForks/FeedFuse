import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('article media attachments migration', () => {
  it('creates article media attachments table', () => {
    const migrationPath = 'src/server/infra/db/migrations/0026_article_media_attachments.sql';
    expect(existsSync(migrationPath)).toBe(true);
    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('create table if not exists article_media_attachments');
    expect(sql).toContain('article_id bigint not null references articles(id) on delete cascade');
    expect(sql).toContain('mime_type text not null');
    expect(sql).toContain('article_media_attachments_article_id_idx');
    expect(sql).toContain('article_media_attachments_article_url_unique');
  });
});
