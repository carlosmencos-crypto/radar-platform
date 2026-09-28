-- Persist actual demo writes; reads and memberships never mark a demonstration.
create table admin_vault.demo_usage (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 last_changed_at timestamptz
);
alter table admin_vault.demo_usage enable row level security;
revoke all on admin_vault.demo_usage from public, anon, authenticated;
create or replace function private.track_demo_saved_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target uuid;
begin
 if TG_OP='UPDATE' and (to_jsonb(NEW)-array['updated_at','updated_by']) is not distinct from (to_jsonb(OLD)-array['updated_at','updated_by']) then return NEW; end if;
 if TG_OP='DELETE' then target:=OLD.campaign_id; else target:=NEW.campaign_id; end if;
 -- Parent lock serializes reset with concurrent writes.
 perform 1 from public.campaigns where id=target and is_demo for update;
 if found then
  insert into admin_vault.demo_usage(campaign_id,last_changed_at) values(target,clock_timestamp())
  on conflict(campaign_id) do update set last_changed_at=excluded.last_changed_at;
 end if;
 if TG_OP='DELETE' then return OLD; end if;
 return NEW;
end $$;
revoke all on function private.track_demo_saved_change() from public,anon,authenticated;
do $$
declare t text;
begin
 foreach t in array array['rtd_results','incidents','activities','fiscales','contacts','candidates','campaign_identity','campaign_records','commitments','resources','strategy_items','pulse_snapshots'] loop
  execute format('create trigger track_demo_saved_change after insert or update or delete on demo_vault.%I for each row execute function private.track_demo_saved_change()',t);
  -- Existing records count, except unchanged built-in seeds.
  if to_regclass('private.seed_'||t) is not null then
   execute format('insert into admin_vault.demo_usage(campaign_id) select distinct d.campaign_id from demo_vault.%I d where exists(select 1 from public.campaigns c where c.id=d.campaign_id and c.is_demo) and not exists(select 1 from private.%I s where to_jsonb(d) @> to_jsonb(s)) on conflict do nothing',t,'seed_'||t);
  else
   execute format('insert into admin_vault.demo_usage(campaign_id) select distinct d.campaign_id from demo_vault.%I d where exists(select 1 from public.campaigns c where c.id=d.campaign_id and c.is_demo) on conflict do nothing',t);
  end if;
 end loop;
end $$;

CREATE OR REPLACE FUNCTION private.reset_demo_campaign(target_campaign uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'demo_vault', 'private', 'pg_temp'
AS $function$
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED';
  end if;
  if not private.can_manage_demo_campaign(target_campaign) then
    raise exception 'DEMO_ADMIN_REQUIRED';
  end if;
  if not exists (
    select 1 from public.campaigns c
    where c.id = target_campaign
      and c.is_demo = true
      and c.status = 'active'
  ) then
    raise exception 'NOT_AN_ACTIVE_DEMO_CAMPAIGN';
  end if;

  delete from demo_vault.rtd_results where campaign_id = target_campaign;
  delete from demo_vault.incidents where campaign_id = target_campaign;
  delete from demo_vault.fiscales where campaign_id = target_campaign;
  delete from demo_vault.activities where campaign_id = target_campaign;
  delete from demo_vault.contacts where campaign_id = target_campaign;
  delete from demo_vault.candidates where campaign_id = target_campaign;
  delete from demo_vault.commitments where campaign_id = target_campaign;
  delete from demo_vault.resources where campaign_id = target_campaign;
  delete from demo_vault.strategy_items where campaign_id = target_campaign;
  delete from demo_vault.pulse_snapshots where campaign_id = target_campaign;

  insert into demo_vault.contacts select * from private.seed_contacts where campaign_id = target_campaign;
  insert into demo_vault.activities select * from private.seed_activities where campaign_id = target_campaign;
  insert into demo_vault.candidates select * from private.seed_candidates where campaign_id = target_campaign;
  insert into demo_vault.fiscales select * from private.seed_fiscales where campaign_id = target_campaign;
  insert into demo_vault.incidents select * from private.seed_incidents where campaign_id = target_campaign;
  insert into demo_vault.rtd_results select * from private.seed_rtd_results where campaign_id = target_campaign;
  insert into demo_vault.commitments select * from private.seed_commitments where campaign_id = target_campaign;
  insert into demo_vault.resources select * from private.seed_resources where campaign_id = target_campaign;
  insert into demo_vault.strategy_items select * from private.seed_strategy_items where campaign_id = target_campaign;
  insert into demo_vault.pulse_snapshots select * from private.seed_pulse_snapshots where campaign_id = target_campaign;
  delete from admin_vault.demo_usage where campaign_id=target_campaign;
end
$function$
;

CREATE OR REPLACE FUNCTION public.radar_admin_snapshot_v1(p_actor_user_id uuid, p_actor_role text, p_second_municipality_code text DEFAULT '1901'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'data_vault', 'campaign_vault', 'admin_vault', 'pg_temp'
AS $function$
declare payload jsonb;
begin
  if p_actor_role not in ('super_admin','data_ops','qa','support','commercial_ops','rtd_ops') then
    raise exception 'admin snapshot denied' using errcode='42501';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=p_actor_user_id and p.is_active and (p.platform_role=p_actor_role or (p_actor_role='super_admin' and p.platform_role='platform_admin'))) then
    raise exception 'inactive administrative profile' using errcode='42501';
  end if;
  if p_second_municipality_code !~ '^[0-9]{4}$' or not exists(
    select 1 from public.municipalities where municipality_code=p_second_municipality_code and not is_synthetic
  ) then raise exception 'unknown second municipality' using errcode='22023'; end if;

  with municipal_state as (
    select m.id,m.municipality_code,m.municipality_name,m.department_code,m.department_name,
      (select count(distinct r.layer_id) from data_vault.municipality_layer_records r
        join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id where r.municipality_id=m.id) as canonical_layers_present,
      (select max(r.updated_at) from data_vault.municipality_layer_records r
        join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id where r.municipality_id=m.id) as data_updated_at,
      (select count(*) from public.campaigns c where c.municipality_id=m.id and c.status='active' and not c.is_demo) as active_campaigns,
      (select count(distinct cm.user_id) from public.campaigns c join public.campaign_members cm on cm.campaign_id=c.id
        where c.municipality_id=m.id and not c.is_demo) as campaign_members,
      (select count(*) from admin_vault.commercial_contracts cc where cc.municipality_id=m.id
        and cc.status in ('RESERVED','ACTIVE','SUSPENDED') and cc.contract_period @> current_date) as protected_contracts
    from public.municipalities m where not m.is_synthetic
  ), layer_base as (
    select cl.layer_id,cl.layer_order,cl.label,cl.domain,
      count(distinct r.municipality_id) as municipalities_present,
      count(r.municipality_id) filter(where r.source_status is null) as rows_without_status,
      max(r.updated_at) as last_updated
    from admin_vault.canonical_layers cl
    left join data_vault.municipality_layer_records r on r.layer_id=cl.layer_id
    group by cl.layer_id,cl.layer_order,cl.label,cl.domain
  ), layer_status as (
    select r.layer_id,coalesce(r.source_status,'<null>') source_status,count(*)::bigint cnt
    from data_vault.municipality_layer_records r
    join admin_vault.canonical_layers cl on cl.layer_id=r.layer_id
    group by r.layer_id,coalesce(r.source_status,'<null>')
  ), layer_state as (
    select lb.*,
      coalesce((select jsonb_object_agg(ls.source_status,ls.cnt) from layer_status ls where ls.layer_id=lb.layer_id),'{}'::jsonb) status_counts
    from layer_base lb
  ), rtd_state as (
    select m.municipality_code,m.department_code,c.id campaign_id,
      (select count(*) from campaign_vault.fiscales f where f.campaign_id=c.id) fiscales,
      (select count(distinct rr.voting_center_code) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) centers_received,
      (select count(distinct (rr.voting_center_code,rr.jrv_code)) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) jrv_received,
      (select count(*) from campaign_vault.rtd_results rr where rr.campaign_id=c.id and rr.status='draft') drafts,
      (select count(*) from campaign_vault.rtd_results rr where rr.campaign_id=c.id and rr.status in ('confirmed','submitted','validated')) confirmed,
      (select count(*) from campaign_vault.incidents i where i.campaign_id=c.id and i.status='open') open_incidents,
      (select max(coalesce(rr.submitted_at,rr.created_at)) from campaign_vault.rtd_results rr where rr.campaign_id=c.id) last_update
    from public.campaigns c join public.municipalities m on m.id=c.municipality_id
    where not c.is_demo
  )
  select jsonb_build_object(
    'generated_at',now(),
    'contract',jsonb_build_object('context_fields',jsonb_build_array('municipality_code','campaign_id','user_role','permissions'),'country_code','GT'),
    'national',jsonb_build_object(
      'municipalities',(select count(*) from municipal_state),
      'departments',(select count(distinct department_code) from municipal_state),
      'municipalities_with_17_layers',(select count(*) from municipal_state where canonical_layers_present=17),
      'active_campaigns',(select count(*) from public.campaigns where status='active' and not is_demo),
      'protected_contracts',(select count(*) from admin_vault.commercial_contracts where status in ('RESERVED','ACTIVE','SUSPENDED') and contract_period @> current_date),
      'active_profiles',(select count(*) from public.profiles where is_active),
      'last_data_update',(select max(data_updated_at) from municipal_state)
    ),
    'municipalities',(select coalesce(jsonb_agg(jsonb_build_object(
      'municipality_code',municipality_code,'municipality_name',municipality_name,
      'department_code',department_code,'department_name',department_name,
      'canonical_layers_present',canonical_layers_present,'active_campaigns',active_campaigns,
      'campaign_members',campaign_members,'protected_contracts',protected_contracts,
      'data_updated_at',data_updated_at,
      'operational_state',case when protected_contracts>0 then 'CONTRACT_PROTECTED' when active_campaigns>0 then 'CAMPAIGN_CONFIGURED' else 'DATA_ONLY' end
    ) order by municipality_code),'[]'::jsonb) from municipal_state),
    'vertical_qa',(select coalesce(jsonb_agg(to_jsonb(ms) order by ms.municipality_code),'[]'::jsonb) from municipal_state ms where ms.municipality_code in ('0509',p_second_municipality_code)),
    'layers',(select coalesce(jsonb_agg(to_jsonb(ls) order by ls.layer_order),'[]'::jsonb) from layer_state ls),
    'sources',(select coalesce(jsonb_agg(to_jsonb(sr) order by sr.layer_id,sr.source_id),'[]'::jsonb)
      from (select source_id,layer_id,source_label,source_url,territorial_scale,source_period,validation_status,lineage,created_at,updated_at from admin_vault.source_registry) sr),
    'campaigns',(select coalesce(jsonb_agg(to_jsonb(x) order by x.municipality_code,x.name),'[]'::jsonb) from (
      select c.id,c.name,c.slug,c.status,c.is_demo,c.created_at,m.municipality_code,m.department_code,
        count(cm.user_id) as member_count,
        exists(select 1 from admin_vault.demo_usage du where du.campaign_id=c.id) as demo_has_changes,
        (select du.last_changed_at from admin_vault.demo_usage du where du.campaign_id=c.id) as demo_last_changed_at
      from public.campaigns c join public.municipalities m on m.id=c.municipality_id
      left join public.campaign_members cm on cm.campaign_id=c.id
      group by c.id,m.municipality_code,m.department_code
    ) x),
    'contracts',(select coalesce(jsonb_agg(to_jsonb(x) order by x.valid_from desc),'[]'::jsonb) from (
      select cc.id,cc.contract_ref,m.municipality_code,m.department_code,cc.campaign_id,cc.client_organization_id,
        cc.valid_from,cc.valid_until,cc.status,cc.created_at,cc.updated_at
      from admin_vault.commercial_contracts cc join public.municipalities m on m.id=cc.municipality_id
    ) x),
    'campaign_health',(select coalesce(jsonb_agg(to_jsonb(x) order by x.municipality_code),'[]'::jsonb) from (
      select c.id campaign_id,m.municipality_code,m.department_code,
        admin_vault.radar_optional_campaign_row_count_v1('campaign_vault.voter_directory',c.id) voter_records,
        (select count(*) from campaign_vault.contacts v where v.campaign_id=c.id) contacts,
        (select count(*) from campaign_vault.activities v where v.campaign_id=c.id) activities,
        (select count(*) from campaign_vault.fiscales v where v.campaign_id=c.id) fiscales,
        (select count(*) from campaign_vault.rtd_results v where v.campaign_id=c.id) rtd_records,
        (select count(*) from campaign_vault.incidents v where v.campaign_id=c.id and v.status='open') open_incidents
      from public.campaigns c join public.municipalities m on m.id=c.municipality_id where not c.is_demo
    ) x),
    'publication_batches',(select coalesce(jsonb_agg(to_jsonb(x) order by x.uploaded_at desc),'[]'::jsonb) from (
      select b.id,b.dataset_key,b.layer_id,b.election_type,b.scope_type,b.country_code,b.department_code,b.municipality_code,b.campaign_id,
        b.source_id,b.source_label,b.source_period,b.file_sha256,b.row_count,b.state,b.diff_summary,b.validation_summary,
        b.preview_hash,b.uploaded_at,b.previewed_at,b.approved_at,b.published_at,b.rejected_at,b.reason,
        (select count(*) from admin_vault.publication_issues i where i.batch_id=b.id and i.severity in ('ERROR','BLOCKER')) blocking_issues
      from admin_vault.publication_batches b order by b.uploaded_at desc limit 100
    ) x),
    'publication_issues',(select coalesce(jsonb_agg(to_jsonb(i) order by i.created_at desc,i.id desc),'[]'::jsonb)
      from (select id,batch_id,severity,issue_code,row_reference,field_name,message,created_at
        from admin_vault.publication_issues order by created_at desc,id desc limit 200) i),
    'pulse_measurements',(select coalesce(jsonb_agg(to_jsonb(x) order by x.field_end desc,x.folio),'[]'::jsonb) from (
      select p.id,p.folio,p.election_type,p.scope_type,p.country_code,p.department_code,p.municipality_code,
        p.field_start,p.field_end,p.sample_size,p.scope_label,p.methodology,p.technical_sheet,p.source_label,p.version,p.status,
        p.preview_hash,p.previewed_at,p.validated_at,p.approved_at,p.published_at,p.updated_at,
        (select count(*) from data_vault.pulse_results r where r.measurement_id=p.id) result_count
      from data_vault.pulse_measurements p order by p.field_end desc,p.folio limit 100
    ) x),
    'publication_states',(select coalesce(jsonb_object_agg(state,cnt),'{}'::jsonb) from (select state,count(*) cnt from admin_vault.publication_batches group by state) x),
    'pulse_states',(select coalesce(jsonb_object_agg(status,cnt),'{}'::jsonb) from (select status,count(*) cnt from data_vault.pulse_measurements group by status) x),
    'rtd',(select coalesce(jsonb_agg(to_jsonb(rs) order by rs.municipality_code),'[]'::jsonb) from rtd_state rs),
    'rtd_monitoring',(select coalesce(jsonb_agg(to_jsonb(rm) order by rm.snapshot_at desc),'[]'::jsonb)
      from (select id,country_code,department_code,municipality_code,campaign_id,centers_total,jrv_total,fiscales_assigned,
        actas_expected,actas_received,actas_with_error,delayed_jrv,snapshot_at from admin_vault.rtd_monitoring_snapshots order by snapshot_at desc limit 200) rm),
    'qa_runs',(select coalesce(jsonb_agg(to_jsonb(q) order by q.created_at desc),'[]'::jsonb) from (select id,git_sha,git_branch,environment,suite,status,checks,started_at,finished_at,created_at from admin_vault.qa_runs order by created_at desc limit 20) q),
    'deployments',(select coalesce(jsonb_agg(to_jsonb(d) order by d.created_at desc),'[]'::jsonb) from (select id,environment,git_sha,build_id,version_label,status,deployed_at,blockers,deployed_at as created_at from admin_vault.deployments order by deployed_at desc limit 20) d),
    'audit',(select coalesce(jsonb_agg(to_jsonb(a) order by a.created_at desc),'[]'::jsonb) from (select id,request_id,actor_user_id,actor_role,action,entity_type,entity_id,municipality_code,department_code,campaign_id,reason,created_at from admin_vault.audit_events order by created_at desc limit 50) a),
    'support',(select coalesce(jsonb_agg(to_jsonb(s) order by s.opened_at desc),'[]'::jsonb) from (select id,ticket_ref,operator_user_id,municipality_code,campaign_id,access_mode,reason,status,expires_at,opened_at,closed_at from admin_vault.support_sessions order by opened_at desc limit 50) s)
  ) into payload;

  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'READ_SNAPSHOT','CONTROL_PLANE',null,null,null,'Consulta operativa del superadministrador');
  return payload;
end
$function$
;

CREATE OR REPLACE FUNCTION public.radar_admin_clients_core_v1(p_actor_user_id uuid, p_actor_role text, p_operation text, p_input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'admin_vault', 'pg_temp'
AS $function$
declare municipality public.municipalities; campaign public.campaigns; account admin_vault.client_accounts; organization uuid; contract uuid; request uuid; result jsonb; capacity integer; archive jsonb; table_name text;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if p_operation='list' then
  return (select coalesce(jsonb_agg(to_jsonb(a)),'[]') from admin_vault.client_accounts a);
 elsif p_operation='onboard' then
  request:=(p_input->>'request_id')::uuid;
  select * into account from admin_vault.client_accounts where request_id=request;
  if found then return to_jsonb(account); end if;
  capacity:=(p_input->>'seat_limit')::integer;
  if capacity not between 1 and 1000 or capacity is null then raise exception 'Cupo inválido'; end if;
  if nullif(trim(p_input->>'name'),'') is null or nullif(trim(p_input->>'display_name'),'') is null or coalesce(p_input->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'Completa nombre de campaña, administrador y correo'; end if;
  select * into municipality from public.municipalities where municipality_code=p_input->>'municipality_code' and not is_synthetic for update;
  if not found then raise exception 'Municipio no válido'; end if;
  if exists(select 1 from admin_vault.commercial_contracts where municipality_id=municipality.id and status in ('RESERVED','ACTIVE','SUSPENDED') and contract_period && daterange(current_date,(p_input->>'valid_until')::date,'[]')) then raise exception 'El municipio ya tiene un contrato que coincide con esta vigencia'; end if;
  insert into public.organizations(name,slug,country_code) values(trim(p_input->>'name'),'cliente-'||request::text,'GT') returning id into organization;
  insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(organization,'GT',municipality.id,trim(p_input->>'name'),'campana-'||request::text,false,'active') returning * into campaign;
  insert into admin_vault.commercial_contracts(municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,valid_until,status,created_by) values(municipality.id,campaign.id,organization,'RADAR-'||municipality.municipality_code||'-'||left(request::text,8),current_date,(p_input->>'valid_until')::date,'ACTIVE',p_actor_user_id) returning id into contract;
  insert into admin_vault.client_accounts(campaign_id,request_id,administrator_name,administrator_email,seat_limit) values(campaign.id,request,trim(p_input->>'display_name'),lower(trim(p_input->>'email')),capacity) returning * into account;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'ONBOARD_CLIENT','CAMPAIGN',campaign.id::text,null,to_jsonb(account),'Contratación confirmada desde Clientes y municipios',null,municipality.municipality_code,municipality.department_code,campaign.id);
  return to_jsonb(account);
 elsif p_operation='limit' then
  perform 1 from public.campaigns where id=(p_input->>'campaign_id')::uuid for update;
  capacity:=(p_input->>'seat_limit')::integer;
  if capacity<(select count(*) from public.campaign_members where campaign_id=(p_input->>'campaign_id')::uuid) then raise exception 'El cupo no puede ser menor al equipo actual'; end if;
  update admin_vault.client_accounts set seat_limit=capacity where campaign_id=(p_input->>'campaign_id')::uuid returning * into account;
  if not found then raise exception 'Esta campaña todavía no tiene ficha de contratación'; end if;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'UPDATE_SEAT_LIMIT','CAMPAIGN',account.campaign_id::text,null,to_jsonb(account),'Ajuste de cupo contratado',null,null,null,account.campaign_id);
  return to_jsonb(account);
 elsif p_operation='reactivate' then
  select * into campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo for update;
  if not found or campaign.status='active' then raise exception 'Selecciona una campaña archivada o pausada'; end if;
  select * into municipality from public.municipalities where id=campaign.municipality_id for update;
  insert into admin_vault.commercial_contracts(municipality_id,campaign_id,client_organization_id,contract_ref,valid_from,valid_until,status,created_by) values(campaign.municipality_id,campaign.id,campaign.organization_id,'RADAR-REN-'||gen_random_uuid()::text,current_date,(p_input->>'valid_until')::date,'ACTIVE',p_actor_user_id);
  update public.campaigns set status='active' where id=campaign.id;
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'REACTIVATE_CLIENT','CAMPAIGN',campaign.id::text,to_jsonb(campaign),jsonb_build_object('status','active'),'Recontratación; los accesos se asignan nuevamente desde la ficha',null,municipality.municipality_code,municipality.department_code,campaign.id);
  return jsonb_build_object('campaign_id',campaign.id);
 elsif p_operation='reset_demo' then
  select * into campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and is_demo for update;
  if not found then raise exception 'Solo se pueden reiniciar campañas demo'; end if;
  if p_input->>'confirmation' is distinct from campaign.name then raise exception 'Escribe el nombre exacto de la demo'; end if;
  archive:='{}';
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates','campaign_identity','campaign_records','commitments','resources','strategy_items','pulse_snapshots'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from demo_vault.%I t where campaign_id=$1',table_name) into result using campaign.id;
   archive:=archive||jsonb_build_object(table_name,result);
  end loop;
  -- Preserve a private recovery copy in the existing closed, append-only audit log.
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RESET_DEMO','CAMPAIGN',campaign.id::text,archive,'{}','Reinicio de información privada de demostración',null,null,null,campaign.id);
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates','campaign_identity','campaign_records','commitments','resources','strategy_items','pulse_snapshots'] loop
   execute format('delete from demo_vault.%I where campaign_id=$1',table_name) using campaign.id;
  end loop;
  delete from admin_vault.demo_usage where campaign_id=campaign.id;
  return jsonb_build_object('campaign_id',campaign.id,'reset',true);
 end if;
 raise exception 'Operación no reconocida';
end $function$
;

