alter table fever_accounts
  drop constraint if exists fever_accounts_auto_sync_interval_minutes_check;

alter table fever_accounts
  add constraint fever_accounts_auto_sync_interval_minutes_check
  check (auto_sync_interval_minutes between 0 and 1440);
