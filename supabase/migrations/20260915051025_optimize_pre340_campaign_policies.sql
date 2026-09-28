drop policy if exists campaign_identity_write on campaign_vault.campaign_identity;

drop policy if exists campaign_identity_insert on campaign_vault.campaign_identity;
create policy campaign_identity_insert
on campaign_vault.campaign_identity for insert to authenticated
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

drop policy if exists campaign_identity_update on campaign_vault.campaign_identity;
create policy campaign_identity_update
on campaign_vault.campaign_identity for update to authenticated
using (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']))
with check (private.is_campaign_member(campaign_id, array['campaign_admin','campaign_editor']));

create index if not exists campaign_identity_updated_by_idx
  on campaign_vault.campaign_identity (updated_by);
create index if not exists activities_campaign_starts_idx
  on campaign_vault.activities (campaign_id, starts_at);
create index if not exists commitments_campaign_due_idx
  on campaign_vault.commitments (campaign_id, due_date);
