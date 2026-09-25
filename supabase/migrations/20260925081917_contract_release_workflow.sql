-- Release only a selected contract. Retain private records and revoke campaign memberships.
create or replace function public.radar_admin_release_contract_v1(p_actor_user_id uuid,p_actor_role text,p_contract_id uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare previous admin_vault.commercial_contracts; saved admin_vault.commercial_contracts; members jsonb;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Indica el motivo'; end if;
 select * into previous from admin_vault.commercial_contracts where id=p_contract_id for update;
 if not found then raise exception 'Contrato inexistente'; end if;
 if p_confirmation is distinct from previous.contract_ref then raise exception 'Escribe la referencia exacta del contrato'; end if;
 if previous.status not in ('RESERVED','ACTIVE','SUSPENDED') then raise exception 'El contrato ya no protege el municipio'; end if;
 if previous.campaign_id is not null then
  perform 1 from public.campaigns where id=previous.campaign_id for update;
  select coalesce(jsonb_agg(to_jsonb(cm)),'[]') into members from public.campaign_members cm where campaign_id=previous.campaign_id;
  delete from public.campaign_members where campaign_id=previous.campaign_id;
  update public.campaigns set status='paused' where id=previous.campaign_id;
 end if;
 update admin_vault.commercial_contracts set status='ENDED',updated_by=p_actor_user_id,updated_at=now() where id=p_contract_id returning * into saved;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'RELEASE_CONTRACT','COMMERCIAL_CONTRACT',p_contract_id::text,jsonb_build_object('contract',to_jsonb(previous),'members',members),to_jsonb(saved),p_reason,null,null,null,previous.campaign_id);
 return jsonb_build_object('contract_id',p_contract_id,'status','ENDED','removed_members',coalesce(jsonb_array_length(members),0));
end $$;
revoke all on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) to service_role;
