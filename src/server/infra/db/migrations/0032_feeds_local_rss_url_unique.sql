drop index if exists feeds_url_unique;

create unique index if not exists feeds_url_unique
  on feeds (url)
  where provider = 'local_rss';
