-- Build after the immutable source finishes loading, before activation.
-- A municipal scan of 816,683 rows took 47 seconds on the QA source.
-- Keep substring matching and municipal authorization unchanged.
set local statement_timeout = '10min';
set local lock_timeout = '5s';
set local maintenance_work_mem = '64MB';
set local max_parallel_maintenance_workers = 0;
create index national_register_2023_name_search_idx
  on campaign_vault.national_register_2023
  using gin (lower(full_name) extensions.gin_trgm_ops)
  with (fastupdate=off);
