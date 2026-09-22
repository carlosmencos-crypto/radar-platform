create index national_register_municipal_stats_municipality_idx
  on campaign_vault.national_register_municipal_stats(municipality_id);
create unique index national_register_one_active_source_idx
  on campaign_vault.national_register_sources((active)) where active;
