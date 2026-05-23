alter table fever_accounts
  add column if not exists auto_sync_enabled boolean not null default true,
  add column if not exists auto_sync_interval_minutes integer not null default 30,
  add column if not exists last_sync_attempt_at timestamptz null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'fever_accounts_auto_sync_interval_minutes_check'
  ) then
    alter table fever_accounts
      add constraint fever_accounts_auto_sync_interval_minutes_check
      check (auto_sync_interval_minutes between 5 and 1440);
  end if;
end $$;
