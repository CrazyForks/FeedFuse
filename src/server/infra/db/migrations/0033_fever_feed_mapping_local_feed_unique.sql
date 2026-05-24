create unique index if not exists fever_feed_mappings_local_feed_id_unique
  on fever_feed_mappings (local_feed_id);

create unique index if not exists fever_accounts_base_url_username_unique
  on fever_accounts (base_url, username);
