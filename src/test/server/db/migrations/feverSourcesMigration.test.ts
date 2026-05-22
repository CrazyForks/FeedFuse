import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('db migrations', () => {
  it('adds fever provider and mapping tables', () => {
    const migrationPath = 'src/server/infra/db/migrations/0029_fever_sources.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain("check (provider in ('local_rss', 'fever'))");
    expect(sql).toContain('create table if not exists fever_accounts');
    expect(sql).toContain('create table if not exists fever_feed_mappings');
    expect(sql).toContain('create table if not exists fever_item_mappings');
    expect(sql).toContain('create table if not exists fever_sync_states');
  });
});
