-- A demo reset must also clear the canonical fiscal/RTD runtime. Otherwise
-- campaign_records disappears while sessions, incidents and folios survive
-- outside the demo vault and reappear on a later synchronization.

create or replace function admin_vault.demo_day_d_state_snapshot(
  p_campaign_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public, admin_vault, pg_temp
as $$
  select jsonb_build_object(
    'day_d_jrv_assignments', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_jrv_assignments row_value
      where row_value.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_incidents', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_incidents row_value
      where row_value.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_incident_updates', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_incident_updates row_value
      join public.day_d_incidents incident on incident.id = row_value.incident_id
      where incident.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_rtd_folios', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_rtd_folios row_value
      where row_value.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_rtd_votes', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_rtd_votes row_value
      join public.day_d_rtd_folios folio on folio.id = row_value.rtd_folio_id
      where folio.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_rtd_history', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_rtd_history row_value
      join public.day_d_rtd_folios folio on folio.id = row_value.rtd_folio_id
      where folio.campaign_id = p_campaign_id
    ), '[]'::jsonb),
    'day_d_evidence', coalesce((
      select jsonb_agg(to_jsonb(row_value))
      from public.day_d_evidence row_value
      where row_value.campaign_id = p_campaign_id
    ), '[]'::jsonb)
  );
$$;

create or replace function admin_vault.purge_demo_day_d_state(
  p_campaign_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, pg_temp
as $$
begin
  if not exists (
    select 1
    from public.campaigns
    where id = p_campaign_id
      and is_demo = true
  ) then
    raise exception 'Solo se puede reiniciar la operación Día D de una campaña demo';
  end if;

  delete from public.day_d_evidence where campaign_id = p_campaign_id;
  delete from public.day_d_incidents where campaign_id = p_campaign_id;
  delete from public.day_d_rtd_folios where campaign_id = p_campaign_id;
  delete from public.day_d_fiscal_sessions where campaign_id = p_campaign_id;
  delete from public.day_d_fiscal_access_grants where campaign_id = p_campaign_id;
  delete from public.day_d_jrv_assignments where campaign_id = p_campaign_id;
end;
$$;

revoke all on function admin_vault.demo_day_d_state_snapshot(uuid) from public;
revoke all on function admin_vault.purge_demo_day_d_state(uuid) from public;

do $$
declare
  definition text;
begin
  select pg_get_functiondef(
    'public.radar_admin_clients_core_v1(uuid,text,text,jsonb)'::regprocedure
  ) into definition;

  if position('admin_vault.demo_day_d_state_snapshot' in definition) = 0 then
    definition := replace(
      definition,
      '  -- Preserve a private recovery copy in the existing closed, append-only audit log.',
      '  archive:=archive||admin_vault.demo_day_d_state_snapshot(campaign.id);
  -- Preserve a private recovery copy in the existing closed, append-only audit log.'
    );
  end if;

  if position('admin_vault.purge_demo_day_d_state' in definition) = 0 then
    definition := replace(
      definition,
      '  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,''RESET_DEMO'',''CAMPAIGN'',campaign.id::text,archive,''{}'',''Reinicio de información privada de demostración'',null,null,null,campaign.id);',
      '  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,''RESET_DEMO'',''CAMPAIGN'',campaign.id::text,archive,''{}'',''Reinicio de información privada de demostración'',null,null,null,campaign.id);
  perform admin_vault.purge_demo_day_d_state(campaign.id);'
    );
  end if;

  if position('admin_vault.demo_day_d_state_snapshot' in definition) = 0
     or position('admin_vault.purge_demo_day_d_state' in definition) = 0 then
    raise exception 'La forma del reinicio administrativo cambió';
  end if;
  execute definition;

  select pg_get_functiondef(
    'private.reset_demo_campaign(uuid)'::regprocedure
  ) into definition;
  if position('admin_vault.purge_demo_day_d_state' in definition) = 0 then
    definition := replace(
      definition,
      '  delete from demo_vault.rtd_results where campaign_id = target_campaign;',
      '  perform admin_vault.purge_demo_day_d_state(target_campaign);

  delete from demo_vault.rtd_results where campaign_id = target_campaign;'
    );
  end if;
  if position('admin_vault.purge_demo_day_d_state' in definition) = 0 then
    raise exception 'La forma del reinicio privado cambió';
  end if;
  execute definition;
end
$$;
