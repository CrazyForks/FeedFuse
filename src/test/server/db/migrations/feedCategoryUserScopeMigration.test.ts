import { readFileSync } from 'node:fs';

describe('feed category user scope migration', () => {
  const sql = readFileSync('src/server/infra/db/migrations/0035_feed_category_user_scope.sql', 'utf8');

  it('adds a trigger that rejects cross-user category bindings on feeds', () => {
    expect(sql).toContain('create or replace function ensure_feed_category_user_scope()');
    expect(sql).toContain("constraint = 'feeds_category_user_scope_fkey'");
    expect(sql).toContain('before insert or update of category_id, user_id on feeds');
  });
});
