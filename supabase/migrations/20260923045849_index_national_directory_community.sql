-- Index exact municipal community filters and their stable paging order.
-- The immutable source, authorization rules and user-role timeouts are unchanged.
set local lock_timeout = '3s';
create index national_register_2023_community_page_idx
  on campaign_vault.national_register_2023 (municipality_id, community, id);
