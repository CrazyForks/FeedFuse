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

  it('adds fever auto sync configuration migration', () => {
    const migrationPath = 'src/server/infra/db/migrations/0030_fever_auto_sync.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('alter table fever_accounts');
    expect(sql).toContain('add column if not exists auto_sync_enabled boolean not null default true');
    expect(sql).toContain('add column if not exists auto_sync_interval_minutes integer not null default 30');
    expect(sql).toContain('add column if not exists last_sync_attempt_at timestamptz null');
    expect(sql).toContain('fever_accounts_auto_sync_interval_minutes_check');
  });

  it('allows disabling fever auto sync with zero-minute interval', () => {
    const migrationPath = 'src/server/infra/db/migrations/0031_fever_auto_sync_interval_zero.sql';
    expect(existsSync(migrationPath)).toBe(true);

    const sql = readFileSync(migrationPath, 'utf8');
    expect(sql).toContain('drop constraint if exists fever_accounts_auto_sync_interval_minutes_check');
    expect(sql).toContain('check (auto_sync_interval_minutes between 0 and 1440)');
  });
});
