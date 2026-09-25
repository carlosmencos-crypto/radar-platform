create index if not exists demo_campaign_identity_updated_by_idx
  on demo_vault.campaign_identity(updated_by);
create index if not exists demo_campaign_records_created_by_idx
  on demo_vault.campaign_records(created_by);

drop policy if exists demo_campaign_identity_write on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_insert on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_update on demo_vault.campaign_identity;
drop policy if exists demo_campaign_identity_delete on demo_vault.campaign_identity;
create policy demo_campaign_identity_insert on demo_vault.campaign_identity
  for insert to authenticated
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_identity_update on demo_vault.campaign_identity
  for update to authenticated using ((select private.can_manage_demo_campaign(campaign_id)))
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_identity_delete on demo_vault.campaign_identity
  for delete to authenticated using ((select private.can_manage_demo_campaign(campaign_id)));

drop policy if exists demo_campaign_records_write on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_insert on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_update on demo_vault.campaign_records;
drop policy if exists demo_campaign_records_delete on demo_vault.campaign_records;
create policy demo_campaign_records_insert on demo_vault.campaign_records
  for insert to authenticated
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_records_update on demo_vault.campaign_records
  for update to authenticated using ((select private.can_manage_demo_campaign(campaign_id)))
  with check ((select private.can_manage_demo_campaign(campaign_id)));
create policy demo_campaign_records_delete on demo_vault.campaign_records
  for delete to authenticated using ((select private.can_manage_demo_campaign(campaign_id)));

notify pgrst, 'reload schema';
