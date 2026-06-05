-- 为所有用户私有表补齐 users 外键，防止内部写入不存在用户的私有数据。
delete from ai_digest_run_sources
where not exists (select 1 from users where users.id = ai_digest_run_sources.user_id);

delete from feed_refresh_run_items
where not exists (select 1 from users where users.id = feed_refresh_run_items.user_id);

delete from fever_item_mappings
where not exists (select 1 from users where users.id = fever_item_mappings.user_id);

delete from fever_feed_mappings
where not exists (select 1 from users where users.id = fever_feed_mappings.user_id);

delete from fever_sync_states
where not exists (select 1 from users where users.id = fever_sync_states.user_id);

delete from feed_favicons
where not exists (select 1 from users where users.id = feed_favicons.user_id);

delete from article_media_attachments
where not exists (select 1 from users where users.id = article_media_attachments.user_id);

delete from article_ai_summary_events
where not exists (select 1 from users where users.id = article_ai_summary_events.user_id);

delete from article_ai_summary_sessions
where not exists (select 1 from users where users.id = article_ai_summary_sessions.user_id);

delete from article_translation_events
where not exists (select 1 from users where users.id = article_translation_events.user_id);

delete from article_translation_segments
where not exists (select 1 from users where users.id = article_translation_segments.user_id);

delete from article_translation_sessions
where not exists (select 1 from users where users.id = article_translation_sessions.user_id);

delete from article_tasks
where not exists (select 1 from users where users.id = article_tasks.user_id);

delete from feed_refresh_runs
where not exists (select 1 from users where users.id = feed_refresh_runs.user_id);

delete from ai_digest_runs
where not exists (select 1 from users where users.id = ai_digest_runs.user_id);

delete from ai_digest_configs
where not exists (select 1 from users where users.id = ai_digest_configs.user_id);

delete from fever_accounts
where not exists (select 1 from users where users.id = fever_accounts.user_id);

delete from articles
where not exists (select 1 from users where users.id = articles.user_id);

delete from feeds
where not exists (select 1 from users where users.id = feeds.user_id);

delete from categories
where not exists (select 1 from users where users.id = categories.user_id);

-- 系统日志允许没有用户所有者；不存在的用户引用降级为系统级日志。
update system_logs
set user_id = null
where user_id is not null
  and not exists (select 1 from users where users.id = system_logs.user_id);

alter table categories drop constraint if exists categories_user_id_fkey;
alter table categories add constraint categories_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table feeds drop constraint if exists feeds_user_id_fkey;
alter table feeds add constraint feeds_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table articles drop constraint if exists articles_user_id_fkey;
alter table articles add constraint articles_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table fever_accounts drop constraint if exists fever_accounts_user_id_fkey;
alter table fever_accounts add constraint fever_accounts_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table fever_feed_mappings drop constraint if exists fever_feed_mappings_user_id_fkey;
alter table fever_feed_mappings add constraint fever_feed_mappings_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table fever_item_mappings drop constraint if exists fever_item_mappings_user_id_fkey;
alter table fever_item_mappings add constraint fever_item_mappings_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table fever_sync_states drop constraint if exists fever_sync_states_user_id_fkey;
alter table fever_sync_states add constraint fever_sync_states_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table ai_digest_configs drop constraint if exists ai_digest_configs_user_id_fkey;
alter table ai_digest_configs add constraint ai_digest_configs_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table ai_digest_runs drop constraint if exists ai_digest_runs_user_id_fkey;
alter table ai_digest_runs add constraint ai_digest_runs_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table feed_refresh_runs drop constraint if exists feed_refresh_runs_user_id_fkey;
alter table feed_refresh_runs add constraint feed_refresh_runs_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table feed_refresh_run_items drop constraint if exists feed_refresh_run_items_user_id_fkey;
alter table feed_refresh_run_items add constraint feed_refresh_run_items_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_tasks drop constraint if exists article_tasks_user_id_fkey;
alter table article_tasks add constraint article_tasks_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_translation_sessions drop constraint if exists article_translation_sessions_user_id_fkey;
alter table article_translation_sessions add constraint article_translation_sessions_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_translation_segments drop constraint if exists article_translation_segments_user_id_fkey;
alter table article_translation_segments add constraint article_translation_segments_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_translation_events drop constraint if exists article_translation_events_user_id_fkey;
alter table article_translation_events add constraint article_translation_events_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_ai_summary_sessions drop constraint if exists article_ai_summary_sessions_user_id_fkey;
alter table article_ai_summary_sessions add constraint article_ai_summary_sessions_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_ai_summary_events drop constraint if exists article_ai_summary_events_user_id_fkey;
alter table article_ai_summary_events add constraint article_ai_summary_events_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table article_media_attachments drop constraint if exists article_media_attachments_user_id_fkey;
alter table article_media_attachments add constraint article_media_attachments_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table feed_favicons drop constraint if exists feed_favicons_user_id_fkey;
alter table feed_favicons add constraint feed_favicons_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table ai_digest_run_sources drop constraint if exists ai_digest_run_sources_user_id_fkey;
alter table ai_digest_run_sources add constraint ai_digest_run_sources_user_id_fkey foreign key (user_id) references users(id) on delete cascade;

alter table system_logs drop constraint if exists system_logs_user_id_fkey;
alter table system_logs add constraint system_logs_user_id_fkey foreign key (user_id) references users(id) on delete set null;
