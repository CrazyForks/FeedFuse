-- 为 feed / ai_digest 绑定分类增加数据库层用户作用域兜底，防止跨账号引用分类。
create or replace function ensure_feed_category_user_scope()
returns trigger
language plpgsql
as $$
begin
  if new.category_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from categories
    where categories.id = new.category_id
      and categories.user_id = new.user_id
  ) then
    raise foreign_key_violation
      using
        constraint = 'feeds_category_user_scope_fkey',
        message = 'feed category must belong to same user';
  end if;

  return new;
end;
$$;

drop trigger if exists feeds_category_user_scope_guard on feeds;

create trigger feeds_category_user_scope_guard
before insert or update of category_id, user_id on feeds
for each row
execute function ensure_feed_category_user_scope();
