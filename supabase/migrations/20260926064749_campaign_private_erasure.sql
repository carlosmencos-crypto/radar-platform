-- Explicit private-data erasure. Ordinary audit events remain append-only.
-- Only this service-only RPC can authorize deletion of specific audit IDs, within its transaction.
create table admin_vault.campaign_erasure_authorizations (
 transaction_id bigint primary key,
 audit_ids bigint[] not null
);
alter table admin_vault.campaign_erasure_authorizations enable row level security;
revoke all on admin_vault.campaign_erasure_authorizations from public, anon, authenticated, service_role;

create or replace function admin_vault.prevent_audit_mutation()
returns trigger language plpgsql set search_path=pg_catalog,admin_vault,pg_temp as $$
begin
 if tg_op='DELETE' and current_user=pg_get_userbyid((select relowner from pg_class where oid='admin_vault.campaign_erasure_authorizations'::regclass)) then
  if exists(select 1 from admin_vault.campaign_erasure_authorizations where transaction_id=txid_current() and old.id=any(audit_ids)) then return old; end if;
 end if;
 raise exception 'audit events are append-only' using errcode='42501';
end $$;

create or replace function public.radar_admin_purge_campaign_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target_campaign public.campaigns; municipality public.municipalities; entity_ids text[]; erase_organization boolean; related_audits bigint[];
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 select * into target_campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo;
 if not found then raise exception 'Selecciona una campaña real existente'; end if;
 select * into municipality from public.municipalities where id=target_campaign.municipality_id for update;
 select * into target_campaign from public.campaigns where id=(p_input->>'campaign_id')::uuid and not is_demo for update;
 if not found then raise exception 'La campaña ya no existe'; end if;
 if p_input->>'confirmation' is distinct from 'ELIMINAR '||municipality.municipality_code or p_input->>'acknowledge' is distinct from 'yes' then
  raise exception 'Confirma el código del municipio y la eliminación definitiva';
 end if;
 perform 1 from public.organizations where id=target_campaign.organization_id for update;
 erase_organization:=not exists(select 1 from public.campaigns where organization_id=target_campaign.organization_id and id<>target_campaign.id)
  and not exists(select 1 from admin_vault.commercial_contracts where client_organization_id=target_campaign.organization_id and campaign_id is distinct from target_campaign.id);
 select array_agg(id) into entity_ids from (
  select target_campaign.id::text id
  union all select id::text from admin_vault.commercial_contracts where campaign_id=target_campaign.id
  union all select id::text from admin_vault.support_sessions where campaign_id=target_campaign.id
  union all select target_campaign.organization_id::text where erase_organization
 ) related;
 select coalesce(array_agg(id),'{}'::bigint[]) into related_audits from admin_vault.audit_events where campaign_id=target_campaign.id or entity_id=any(entity_ids);
 insert into admin_vault.campaign_erasure_authorizations(transaction_id,audit_ids) values(txid_current(),related_audits);
 delete from admin_vault.audit_events where id=any(related_audits);
 delete from admin_vault.campaign_erasure_authorizations where transaction_id=txid_current();
 -- Publication records describe official intelligence; preserve them, unlink the customer.
 update admin_vault.publication_batches set campaign_id=null where campaign_id=target_campaign.id;
 delete from admin_vault.support_sessions where campaign_id=target_campaign.id;
 delete from admin_vault.client_accounts where campaign_id=target_campaign.id;
 delete from admin_vault.commercial_contracts where campaign_id=target_campaign.id;
 -- Foreign keys remove memberships, six private campaign tables, scopes and RTD snapshots atomically.
 delete from public.campaigns where id=target_campaign.id;
 if erase_organization then
  update public.profiles set organization_id=null where organization_id=target_campaign.organization_id;
  delete from public.organizations where id=target_campaign.organization_id;
 end if;
 -- Minimal accountability only: no campaign UUID/name, private record copy, or contact information.
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'PURGE_CAMPAIGN','MUNICIPALITY',municipality.municipality_code,null,null,'Eliminación definitiva confirmada de campaña y datos privados',null,municipality.municipality_code,municipality.department_code,null);
 return jsonb_build_object('deleted',true,'municipality_code',municipality.municipality_code);
end $$;
revoke all on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) to service_role;
