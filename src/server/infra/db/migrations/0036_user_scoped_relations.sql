-- 收紧多用户关系表的数据库兜底，防止内部误调用把私有资源串到其他账号。
delete from article_tasks
using articles
where article_tasks.article_id = articles.id
  and article_tasks.user_id <> articles.user_id;

delete from articles
using feeds
where articles.feed_id = feeds.id
  and articles.user_id <> feeds.user_id;

delete from ai_digest_configs
using feeds
where ai_digest_configs.feed_id = feeds.id
  and ai_digest_configs.user_id <> feeds.user_id;

delete from ai_digest_runs
using feeds
where ai_digest_runs.feed_id = feeds.id
  and ai_digest_runs.user_id <> feeds.user_id;

update ai_digest_runs
set article_id = null
from articles
where ai_digest_runs.article_id = articles.id
  and ai_digest_runs.user_id <> articles.user_id;

update feed_refresh_runs
set feed_id = null
from feeds
where feed_refresh_runs.feed_id = feeds.id
  and feed_refresh_runs.user_id <> feeds.user_id;

delete from article_translation_sessions
using articles
where article_translation_sessions.article_id = articles.id
  and article_translation_sessions.user_id <> articles.user_id;

delete from article_translation_segments
using article_translation_sessions
where article_translation_segments.session_id = article_translation_sessions.id
  and article_translation_segments.user_id <> article_translation_sessions.user_id;

delete from article_translation_events
using article_translation_sessions
where article_translation_events.session_id = article_translation_sessions.id
  and article_translation_events.user_id <> article_translation_sessions.user_id;

delete from article_ai_summary_sessions
using articles
where article_ai_summary_sessions.article_id = articles.id
  and article_ai_summary_sessions.user_id <> articles.user_id;

delete from article_ai_summary_events
using article_ai_summary_sessions
where article_ai_summary_events.session_id = article_ai_summary_sessions.id
  and article_ai_summary_events.user_id <> article_ai_summary_sessions.user_id;

delete from article_media_attachments
using articles
where article_media_attachments.article_id = articles.id
  and article_media_attachments.user_id <> articles.user_id;

delete from feed_favicons
using feeds
where feed_favicons.feed_id = feeds.id
  and feed_favicons.user_id <> feeds.user_id;

delete from feed_refresh_run_items
using feed_refresh_runs, feeds
where feed_refresh_run_items.run_id = feed_refresh_runs.id
  and feed_refresh_run_items.feed_id = feeds.id
  and (
    feed_refresh_run_items.user_id <> feed_refresh_runs.user_id
    or feed_refresh_run_items.user_id <> feeds.user_id
  );

delete from fever_feed_mappings
using fever_accounts, feeds
where fever_feed_mappings.fever_account_id = fever_accounts.id
  and fever_feed_mappings.local_feed_id = feeds.id
  and (
    fever_feed_mappings.user_id <> fever_accounts.user_id
    or fever_feed_mappings.user_id <> feeds.user_id
  );

delete from fever_item_mappings
using fever_accounts, feeds, articles
where fever_item_mappings.fever_account_id = fever_accounts.id
  and fever_item_mappings.local_feed_id = feeds.id
  and fever_item_mappings.local_article_id = articles.id
  and (
    fever_item_mappings.user_id <> fever_accounts.user_id
    or fever_item_mappings.user_id <> feeds.user_id
    or fever_item_mappings.user_id <> articles.user_id
  );

delete from fever_sync_states
using fever_accounts
where fever_sync_states.fever_account_id = fever_accounts.id
  and fever_sync_states.user_id <> fever_accounts.user_id;

delete from ai_digest_run_sources
using ai_digest_runs, articles
where ai_digest_run_sources.run_id = ai_digest_runs.id
  and ai_digest_run_sources.source_article_id = articles.id
  and (
    ai_digest_run_sources.user_id <> ai_digest_runs.user_id
    or ai_digest_run_sources.user_id <> articles.user_id
  );

drop index if exists article_tasks_article_id_type_unique;
create unique index if not exists article_tasks_user_article_type_unique
  on article_tasks (user_id, article_id, type);

drop index if exists article_translation_sessions_article_id_unique;
create unique index if not exists article_translation_sessions_user_article_unique
  on article_translation_sessions (user_id, article_id);

drop index if exists article_translation_segments_session_id_segment_index_unique;
create unique index if not exists article_translation_segments_user_session_index_unique
  on article_translation_segments (user_id, session_id, segment_index);

drop index if exists article_media_attachments_article_url_unique;
create unique index if not exists article_media_attachments_user_article_url_unique
  on article_media_attachments (user_id, article_id, url);

alter table feed_favicons drop constraint if exists feed_favicons_pkey;
alter table feed_favicons add constraint feed_favicons_pkey primary key (user_id, feed_id);

alter table feed_refresh_run_items drop constraint if exists feed_refresh_run_items_run_id_feed_id_key;
alter table feed_refresh_run_items add constraint feed_refresh_run_items_user_run_feed_unique
  unique (user_id, run_id, feed_id);

alter table fever_feed_mappings drop constraint if exists fever_feed_mappings_pkey;
alter table fever_feed_mappings add constraint fever_feed_mappings_user_account_feed_unique
  primary key (user_id, fever_account_id, fever_feed_id);

alter table fever_item_mappings drop constraint if exists fever_item_mappings_pkey;
alter table fever_item_mappings add constraint fever_item_mappings_user_account_item_unique
  primary key (user_id, fever_account_id, fever_item_id);

alter table fever_sync_states drop constraint if exists fever_sync_states_pkey;
alter table fever_sync_states add constraint fever_sync_states_user_account_unique
  primary key (user_id, fever_account_id);

alter table ai_digest_run_sources drop constraint if exists ai_digest_run_sources_pkey;
alter table ai_digest_run_sources add constraint ai_digest_run_sources_user_run_article_unique
  primary key (user_id, run_id, source_article_id);
alter table ai_digest_run_sources drop constraint if exists ai_digest_run_sources_run_id_position_key;
alter table ai_digest_run_sources add constraint ai_digest_run_sources_user_run_position_unique
  unique (user_id, run_id, position);

create or replace function ensure_user_scoped_relations()
returns trigger
language plpgsql
as $$
begin
  if tg_table_name = 'articles' then
    if not exists (select 1 from feeds where id = new.feed_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'articles_feed_user_scope_fkey',
              message = 'article must belong to same user as feed';
    end if;
  elsif tg_table_name = 'ai_digest_configs' then
    if not exists (select 1 from feeds where id = new.feed_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'ai_digest_configs_feed_user_scope_fkey',
              message = 'ai digest config must belong to same user as feed';
    end if;
  elsif tg_table_name = 'ai_digest_runs' then
    if not exists (select 1 from feeds where id = new.feed_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'ai_digest_runs_feed_user_scope_fkey',
              message = 'ai digest run must belong to same user as feed';
    end if;
    if new.article_id is not null and not exists (
      select 1 from articles where id = new.article_id and user_id = new.user_id
    ) then
      raise foreign_key_violation
        using constraint = 'ai_digest_runs_article_user_scope_fkey',
              message = 'ai digest run article must belong to same user as run';
    end if;
  elsif tg_table_name = 'feed_refresh_runs' then
    if new.feed_id is not null and not exists (select 1 from feeds where id = new.feed_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'feed_refresh_runs_feed_user_scope_fkey',
              message = 'feed refresh run must belong to same user as feed';
    end if;
  elsif tg_table_name = 'article_tasks' then
    if not exists (select 1 from articles where id = new.article_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_tasks_article_user_scope_fkey',
              message = 'article task must belong to same user as article';
    end if;
  elsif tg_table_name = 'article_translation_sessions' then
    if not exists (select 1 from articles where id = new.article_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_translation_sessions_article_user_scope_fkey',
              message = 'translation session must belong to same user as article';
    end if;
  elsif tg_table_name = 'article_translation_segments' then
    if not exists (select 1 from article_translation_sessions where id = new.session_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_translation_segments_session_user_scope_fkey',
              message = 'translation segment must belong to same user as session';
    end if;
  elsif tg_table_name = 'article_translation_events' then
    if not exists (select 1 from article_translation_sessions where id = new.session_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_translation_events_session_user_scope_fkey',
              message = 'translation event must belong to same user as session';
    end if;
  elsif tg_table_name = 'article_ai_summary_sessions' then
    if not exists (select 1 from articles where id = new.article_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_ai_summary_sessions_article_user_scope_fkey',
              message = 'ai summary session must belong to same user as article';
    end if;
  elsif tg_table_name = 'article_ai_summary_events' then
    if not exists (select 1 from article_ai_summary_sessions where id = new.session_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_ai_summary_events_session_user_scope_fkey',
              message = 'ai summary event must belong to same user as session';
    end if;
  elsif tg_table_name = 'article_media_attachments' then
    if not exists (select 1 from articles where id = new.article_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'article_media_attachments_article_user_scope_fkey',
              message = 'media attachment must belong to same user as article';
    end if;
  elsif tg_table_name = 'feed_favicons' then
    if not exists (select 1 from feeds where id = new.feed_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'feed_favicons_feed_user_scope_fkey',
              message = 'feed favicon must belong to same user as feed';
    end if;
  elsif tg_table_name = 'feed_refresh_run_items' then
    if not exists (
      select 1
      from feed_refresh_runs
      join feeds on feeds.id = new.feed_id
      where feed_refresh_runs.id = new.run_id
        and feed_refresh_runs.user_id = new.user_id
        and feeds.user_id = new.user_id
    ) then
      raise foreign_key_violation
        using constraint = 'feed_refresh_run_items_user_scope_fkey',
              message = 'feed refresh run item must belong to same user as run and feed';
    end if;
  elsif tg_table_name = 'fever_feed_mappings' then
    if not exists (
      select 1
      from fever_accounts
      join feeds on feeds.id = new.local_feed_id
      where fever_accounts.id = new.fever_account_id
        and fever_accounts.user_id = new.user_id
        and feeds.user_id = new.user_id
    ) then
      raise foreign_key_violation
        using constraint = 'fever_feed_mappings_user_scope_fkey',
              message = 'fever mapping must belong to same user as account and local feed';
    end if;
  elsif tg_table_name = 'fever_item_mappings' then
    if not exists (
      select 1
      from fever_accounts
      join feeds on feeds.id = new.local_feed_id
      join articles on articles.id = new.local_article_id
      where fever_accounts.id = new.fever_account_id
        and fever_accounts.user_id = new.user_id
        and feeds.user_id = new.user_id
        and articles.user_id = new.user_id
    ) then
      raise foreign_key_violation
        using constraint = 'fever_item_mappings_user_scope_fkey',
              message = 'fever mapping must belong to same user as account, local feed and article';
    end if;
  elsif tg_table_name = 'fever_sync_states' then
    if not exists (select 1 from fever_accounts where id = new.fever_account_id and user_id = new.user_id) then
      raise foreign_key_violation
        using constraint = 'fever_sync_states_user_scope_fkey',
              message = 'fever sync state must belong to same user as account';
    end if;
  elsif tg_table_name = 'ai_digest_run_sources' then
    if not exists (
      select 1
      from ai_digest_runs
      join articles on articles.id = new.source_article_id
      where ai_digest_runs.id = new.run_id
        and ai_digest_runs.user_id = new.user_id
        and articles.user_id = new.user_id
    ) then
      raise foreign_key_violation
        using constraint = 'ai_digest_run_sources_user_scope_fkey',
              message = 'ai digest source must belong to same user as run and article';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists article_tasks_user_scope_guard on article_tasks;
drop trigger if exists articles_user_scope_guard on articles;
create trigger articles_user_scope_guard
before insert or update of user_id, feed_id on articles
for each row execute function ensure_user_scoped_relations();

drop trigger if exists ai_digest_configs_user_scope_guard on ai_digest_configs;
create trigger ai_digest_configs_user_scope_guard
before insert or update of user_id, feed_id on ai_digest_configs
for each row execute function ensure_user_scoped_relations();

drop trigger if exists ai_digest_runs_user_scope_guard on ai_digest_runs;
create trigger ai_digest_runs_user_scope_guard
before insert or update of user_id, feed_id, article_id on ai_digest_runs
for each row execute function ensure_user_scoped_relations();

drop trigger if exists feed_refresh_runs_user_scope_guard on feed_refresh_runs;
create trigger feed_refresh_runs_user_scope_guard
before insert or update of user_id, feed_id on feed_refresh_runs
for each row execute function ensure_user_scoped_relations();

create trigger article_tasks_user_scope_guard
before insert or update of user_id, article_id on article_tasks
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_translation_sessions_user_scope_guard on article_translation_sessions;
create trigger article_translation_sessions_user_scope_guard
before insert or update of user_id, article_id on article_translation_sessions
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_translation_segments_user_scope_guard on article_translation_segments;
create trigger article_translation_segments_user_scope_guard
before insert or update of user_id, session_id on article_translation_segments
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_translation_events_user_scope_guard on article_translation_events;
create trigger article_translation_events_user_scope_guard
before insert or update of user_id, session_id on article_translation_events
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_ai_summary_sessions_user_scope_guard on article_ai_summary_sessions;
create trigger article_ai_summary_sessions_user_scope_guard
before insert or update of user_id, article_id on article_ai_summary_sessions
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_ai_summary_events_user_scope_guard on article_ai_summary_events;
create trigger article_ai_summary_events_user_scope_guard
before insert or update of user_id, session_id on article_ai_summary_events
for each row execute function ensure_user_scoped_relations();

drop trigger if exists article_media_attachments_user_scope_guard on article_media_attachments;
create trigger article_media_attachments_user_scope_guard
before insert or update of user_id, article_id on article_media_attachments
for each row execute function ensure_user_scoped_relations();

drop trigger if exists feed_favicons_user_scope_guard on feed_favicons;
create trigger feed_favicons_user_scope_guard
before insert or update of user_id, feed_id on feed_favicons
for each row execute function ensure_user_scoped_relations();

drop trigger if exists feed_refresh_run_items_user_scope_guard on feed_refresh_run_items;
create trigger feed_refresh_run_items_user_scope_guard
before insert or update of user_id, run_id, feed_id on feed_refresh_run_items
for each row execute function ensure_user_scoped_relations();

drop trigger if exists fever_feed_mappings_user_scope_guard on fever_feed_mappings;
create trigger fever_feed_mappings_user_scope_guard
before insert or update of user_id, fever_account_id, local_feed_id on fever_feed_mappings
for each row execute function ensure_user_scoped_relations();

drop trigger if exists fever_item_mappings_user_scope_guard on fever_item_mappings;
create trigger fever_item_mappings_user_scope_guard
before insert or update of user_id, fever_account_id, local_feed_id, local_article_id on fever_item_mappings
for each row execute function ensure_user_scoped_relations();

drop trigger if exists fever_sync_states_user_scope_guard on fever_sync_states;
create trigger fever_sync_states_user_scope_guard
before insert or update of user_id, fever_account_id on fever_sync_states
for each row execute function ensure_user_scoped_relations();

drop trigger if exists ai_digest_run_sources_user_scope_guard on ai_digest_run_sources;
create trigger ai_digest_run_sources_user_scope_guard
before insert or update of user_id, run_id, source_article_id on ai_digest_run_sources
for each row execute function ensure_user_scoped_relations();
