-- Private Campaign Vault files. The first path segment is always campaign_id.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'radar-campaign-vault',
  'radar-campaign-vault',
  false,
  20971520,
  array[
    'image/jpeg','image/png','image/webp','application/pdf',
    'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists radar_campaign_vault_files_select on storage.objects;
create policy radar_campaign_vault_files_select
on storage.objects for select to authenticated
using (
  bucket_id = 'radar-campaign-vault'
  and private.is_campaign_member(((storage.foldername(name))[1])::uuid, array['campaign_admin','campaign_editor','campaign_viewer'])
);

drop policy if exists radar_campaign_vault_files_insert on storage.objects;
create policy radar_campaign_vault_files_insert
on storage.objects for insert to authenticated
with check (
  bucket_id = 'radar-campaign-vault'
  and private.is_campaign_member(((storage.foldername(name))[1])::uuid, array['campaign_admin','campaign_editor'])
);

drop policy if exists radar_campaign_vault_files_update on storage.objects;
create policy radar_campaign_vault_files_update
on storage.objects for update to authenticated
using (
  bucket_id = 'radar-campaign-vault'
  and private.is_campaign_member(((storage.foldername(name))[1])::uuid, array['campaign_admin','campaign_editor'])
)
with check (
  bucket_id = 'radar-campaign-vault'
  and private.is_campaign_member(((storage.foldername(name))[1])::uuid, array['campaign_admin','campaign_editor'])
);

drop policy if exists radar_campaign_vault_files_delete on storage.objects;
create policy radar_campaign_vault_files_delete
on storage.objects for delete to authenticated
using (
  bucket_id = 'radar-campaign-vault'
  and private.is_campaign_member(((storage.foldername(name))[1])::uuid, array['campaign_admin','campaign_editor'])
);
