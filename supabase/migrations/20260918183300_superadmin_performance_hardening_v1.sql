-- Cover foreign keys used by the national control plane and close a trigger-only
-- SECURITY DEFINER function that must never be callable as an RPC.

revoke all on function public.handle_new_user() from public,anon,authenticated;

create index if not exists operator_scopes_campaign_idx on admin_vault.operator_scopes(campaign_id) where campaign_id is not null;
create index if not exists operator_scopes_granted_by_idx on admin_vault.operator_scopes(granted_by) where granted_by is not null;
create index if not exists commercial_contracts_organization_idx on admin_vault.commercial_contracts(client_organization_id);
create index if not exists commercial_contracts_created_by_idx on admin_vault.commercial_contracts(created_by);
create index if not exists commercial_contracts_updated_by_idx on admin_vault.commercial_contracts(updated_by) where updated_by is not null;
create index if not exists source_registry_layer_idx on admin_vault.source_registry(layer_id);
create index if not exists source_registry_registered_by_idx on admin_vault.source_registry(registered_by) where registered_by is not null;
create index if not exists publication_batches_layer_idx on admin_vault.publication_batches(layer_id) where layer_id is not null;
create index if not exists publication_batches_campaign_idx on admin_vault.publication_batches(campaign_id) where campaign_id is not null;
create index if not exists publication_batches_uploaded_by_idx on admin_vault.publication_batches(uploaded_by);
create index if not exists publication_batches_previewed_by_idx on admin_vault.publication_batches(previewed_by) where previewed_by is not null;
create index if not exists publication_batches_approved_by_idx on admin_vault.publication_batches(approved_by) where approved_by is not null;
create index if not exists publication_batches_published_by_idx on admin_vault.publication_batches(published_by) where published_by is not null;
create index if not exists publication_batches_rejected_by_idx on admin_vault.publication_batches(rejected_by) where rejected_by is not null;
create index if not exists dataset_releases_batch_idx on admin_vault.dataset_releases(batch_id);
create index if not exists dataset_releases_supersedes_idx on admin_vault.dataset_releases(supersedes_release_id) where supersedes_release_id is not null;
create index if not exists dataset_releases_rollback_idx on admin_vault.dataset_releases(rolled_back_from_release_id) where rolled_back_from_release_id is not null;
create index if not exists dataset_releases_published_by_idx on admin_vault.dataset_releases(published_by);
create index if not exists audit_events_actor_idx on admin_vault.audit_events(actor_user_id) where actor_user_id is not null;
create index if not exists audit_events_campaign_idx on admin_vault.audit_events(campaign_id) where campaign_id is not null;
create index if not exists support_sessions_campaign_idx on admin_vault.support_sessions(campaign_id) where campaign_id is not null;
create index if not exists deployments_deployed_by_idx on admin_vault.deployments(deployed_by) where deployed_by is not null;
create index if not exists rtd_monitoring_campaign_idx on admin_vault.rtd_monitoring_snapshots(campaign_id) where campaign_id is not null;

create index if not exists pulse_measurements_created_by_idx on data_vault.pulse_measurements(created_by) where created_by is not null;
create index if not exists pulse_measurements_updated_by_idx on data_vault.pulse_measurements(updated_by) where updated_by is not null;
create index if not exists pulse_measurements_approved_by_idx on data_vault.pulse_measurements(approved_by) where approved_by is not null;
create index if not exists pulse_measurements_published_by_idx on data_vault.pulse_measurements(published_by) where published_by is not null;
create index if not exists pulse_measurements_supersedes_idx on data_vault.pulse_measurements(supersedes_measurement_id) where supersedes_measurement_id is not null;
