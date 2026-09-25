-- QA control plane: membership changes are atomic, audited and service-only.
create or replace function public.radar_admin_campaign_member_v1(
 p_actor_user_id uuid,p_actor_role text,p_campaign_id uuid,p_user_id uuid,p_member_role text,p_reason text
) returns jsonb language plpgsql security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare c public.campaigns; previous public.campaign_members; saved public.campaign_members;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Indica el motivo'; end if;
 select * into c from public.campaigns where id=p_campaign_id for update;
 if not found then raise exception 'Campaña inexistente'; end if;
 if p_member_role is not null and ((c.is_demo and p_member_role not in ('demo_admin','demo_viewer')) or (not c.is_demo and p_member_role not in ('campaign_admin','campaign_editor','campaign_viewer'))) then raise exception 'Rol incompatible con la campaña'; end if;
 if not exists(select 1 from auth.users where id=p_user_id) then raise exception 'Usuario inexistente'; end if;
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 if previous.member_role in ('campaign_admin','demo_admin') and (p_member_role is null or p_member_role not in ('campaign_admin','demo_admin')) and not exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active join auth.users u on u.id=cm.user_id where cm.campaign_id=p_campaign_id and cm.user_id<>p_user_id and cm.member_role in ('campaign_admin','demo_admin') and (u.banned_until is null or u.banned_until<=now())) then raise exception 'Asigna otro administrador antes de retirar este acceso'; end if;
 if p_member_role is null then
   delete from public.campaign_members where campaign_id=p_campaign_id and user_id=p_user_id;
 else
   insert into public.profiles(user_id,platform_role,is_active) values(p_user_id,'user',true) on conflict(user_id) do nothing;
   insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,p_user_id,p_member_role)
   on conflict(campaign_id,user_id) do update set member_role=excluded.member_role returning * into saved;
 end if;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,case when p_member_role is null then 'REMOVE_CAMPAIGN_MEMBER' else 'ASSIGN_CAMPAIGN_MEMBER' end,'CAMPAIGN_MEMBER',p_campaign_id::text||':'||p_user_id::text,to_jsonb(previous),to_jsonb(saved),p_reason,null,null,null,p_campaign_id);
 return jsonb_build_object('campaign_id',p_campaign_id,'user_id',p_user_id,'member_role',p_member_role);
end $$;
revoke all on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_campaign_member_v1(uuid,text,uuid,uuid,text,text) to service_role;
