create or replace function admin_vault.radar_optional_campaign_row_count_v1(
  p_relation_name text,
  p_campaign_id uuid
)
returns bigint
language plpgsql
stable
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  target_relation regclass;
  row_count bigint;
begin
  target_relation := to_regclass(p_relation_name);
  if target_relation is null then
    return 0;
  end if;

  execute format('select count(*) from %s where campaign_id = $1', target_relation)
    into row_count
    using p_campaign_id;

  return coalesce(row_count, 0);
end
$$;

revoke all on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  from public, anon, authenticated;
grant execute on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  to service_role;

comment on function admin_vault.radar_optional_campaign_row_count_v1(text,uuid)
  is 'Returns a campaign row count for an optional vault relation without exposing its rows.';

do $$
declare
  snapshot_definition text;
  patched_definition text;
  old_voter_expression constant text :=
    '(select count(*) from campaign_vault.voter_directory v where v.campaign_id=c.id) voter_records,';
  new_voter_expression constant text :=
    'admin_vault.radar_optional_campaign_row_count_v1(''campaign_vault.voter_directory'',c.id) voter_records,';
  old_deployment_expression constant text :=
    '(select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,created_at from admin_vault.deployments order by created_at desc limit 20)';
  new_deployment_expression constant text :=
    '(select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,deployed_at as created_at from admin_vault.deployments order by deployed_at desc limit 20)';
begin
  select pg_get_functiondef('public.radar_admin_snapshot_v1(uuid,text,text)'::regprocedure)
    into snapshot_definition;

  patched_definition := replace(snapshot_definition, old_voter_expression, new_voter_expression);
  patched_definition := replace(patched_definition, old_deployment_expression, new_deployment_expression);

  if patched_definition = snapshot_definition then
    raise exception 'radar_admin_snapshot_v1 compatibility patch targets were not found';
  end if;

  execute patched_definition;
end
$$;

revoke all on function public.radar_admin_snapshot_v1(uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.radar_admin_snapshot_v1(uuid,text,text)
  to service_role;
