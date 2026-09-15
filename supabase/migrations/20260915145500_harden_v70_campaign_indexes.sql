drop policy if exists campaign_records_write on campaign_vault.campaign_records;

drop policy if exists campaign_records_insert on campaign_vault.campaign_records;
create policy campaign_records_insert on campaign_vault.campaign_records
for insert to authenticated
with check (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']));

drop policy if exists campaign_records_update on campaign_vault.campaign_records;
create policy campaign_records_update on campaign_vault.campaign_records
for update to authenticated
using (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']))
with check (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']));

drop policy if exists campaign_records_delete on campaign_vault.campaign_records;
create policy campaign_records_delete on campaign_vault.campaign_records
for delete to authenticated
using (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']));

create index if not exists activities_created_by_idx on campaign_vault.activities(created_by);
create index if not exists contacts_created_by_idx on campaign_vault.contacts(created_by);
create index if not exists campaign_records_created_by_idx on campaign_vault.campaign_records(created_by);
create index if not exists voter_directory_assigned_contact_idx on campaign_vault.voter_directory(assigned_contact_id);
create index if not exists voter_interactions_voter_idx on campaign_vault.voter_interactions(voter_id);
create index if not exists voter_interactions_responsible_contact_idx on campaign_vault.voter_interactions(responsible_contact_id);
create index if not exists voter_interactions_created_by_idx on campaign_vault.voter_interactions(created_by);
