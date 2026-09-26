create table admin_vault.client_accounts (
 campaign_id uuid primary key references public.campaigns(id),
 request_id uuid not null unique,
 administrator_name text not null,
 administrator_email text not null,
 seat_limit integer not null default 10 check(seat_limit between 1 and 1000),
 created_at timestamptz not null default now()
);
alter table admin_vault.client_accounts enable row level security;
revoke all on admin_vault.client_accounts from anon,authenticated;

create or replace function admin_vault.check_campaign_seat_limit() returns trigger language plpgsql security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare capacity integer;
begin
 perform 1 from public.campaigns where id=new.campaign_id for update;
 select seat_limit into capacity from admin_vault.client_accounts where campaign_id=new.campaign_id;
 if capacity is not null and not exists(select 1 from public.campaign_members where campaign_id=new.campaign_id and user_id=new.user_id) and (select count(*) from public.campaign_members where campaign_id=new.campaign_id)>=capacity then
  raise exception 'Se alcanzó el cupo de usuarios. Solicita una ampliación a RADAR.' using errcode='23514';
 end if;
 return new;
end $$;
revoke all on function admin_vault.check_campaign_seat_limit() from public,anon,authenticated;
create trigger campaign_seat_limit before insert or update on public.campaign_members for each row execute function admin_vault.check_campaign_seat_limit();

create or replace function public.radar_admin_clients_v1(p_actor_user_id uuid,p_actor_role text,p_operation text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
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
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates'] loop
   execute format('select coalesce(jsonb_agg(to_jsonb(t)),''[]'') from demo_vault.%I t where campaign_id=$1',table_name) into result using campaign.id;
   archive:=archive||jsonb_build_object(table_name,result);
  end loop;
  -- Preserve a private recovery copy in the existing closed, append-only audit log.
  perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RESET_DEMO','CAMPAIGN',campaign.id::text,archive,'{}','Reinicio de información privada de demostración',null,null,null,campaign.id);
  foreach table_name in array array['rtd_results','incidents','activities','fiscales','contacts','candidates'] loop
   execute format('delete from demo_vault.%I where campaign_id=$1',table_name) using campaign.id;
  end loop;
  return jsonb_build_object('campaign_id',campaign.id,'reset',true);
 end if;
 raise exception 'Operación no reconocida';
end $$;
revoke all on function public.radar_admin_clients_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_clients_v1(uuid,text,text,jsonb) to service_role;
