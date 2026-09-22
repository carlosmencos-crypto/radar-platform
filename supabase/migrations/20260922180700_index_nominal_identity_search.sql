-- Exact DPI lookup stays inside the authorized municipal query.
set local statement_timeout = '10min';
set local lock_timeout = '5s';
set local maintenance_work_mem = '64MB';
set local max_parallel_maintenance_workers = 0;
create index national_register_2023_identity_search_idx
  on campaign_vault.national_register_2023 (identification,municipality_id);
