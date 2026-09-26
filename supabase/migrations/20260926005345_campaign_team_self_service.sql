create or replace function public.radar_campaign_team_v1(p_actor_user_id uuid,p_campaign_id uuid,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target uuid; target_role text; previous public.campaign_members; capacity integer; municipality text;
begin
 perform 1 from public.campaigns where id=p_campaign_id and status='active' and not is_demo for update;
 if not found or not exists(select 1 from public.campaign_members cm join public.profiles p on p.user_id=cm.user_id and p.is_active where cm.campaign_id=p_campaign_id and cm.user_id=p_actor_user_id and cm.member_role='campaign_admin') then raise exception 'Solo el administrador de esta campaña puede gestionar su equipo' using errcode='42501'; end if;
 select seat_limit into capacity from admin_vault.client_accounts where campaign_id=p_campaign_id;
 capacity:=coalesce(capacity,10);
 select m.municipality_code into municipality from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id;
 if p_operation='list' then return jsonb_build_object('seat_limit',capacity,'municipality_code',municipality,'members',(select coalesce(jsonb_agg(jsonb_build_object('user_id',cm.user_id,'email',u.email,'member_role',cm.member_role)),'[]') from public.campaign_members cm join auth.users u on u.id=cm.user_id where cm.campaign_id=p_campaign_id)); end if;
 if p_operation='prepare_invite' then
  if (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo. Solicita una ampliación a RADAR.'; end if;
  return jsonb_build_object('municipality_code',municipality);
 end if;
 target:=(p_input->>'user_id')::uuid;target_role:=p_input->>'member_role';
 select * into previous from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 if previous.member_role='campaign_admin' or target=p_actor_user_id then raise exception 'El administrador principal solo puede cambiarse desde RADAR'; end if;
 if p_operation='remove' then delete from public.campaign_members where campaign_id=p_campaign_id and user_id=target;
 elsif p_operation='assign' then
  if target_role not in ('campaign_editor','campaign_viewer') or target_role is null then raise exception 'Selecciona Editor o Consulta'; end if;
  if previous.user_id is null and (select count(*) from public.campaign_members where campaign_id=p_campaign_id)>=capacity then raise exception 'Cupo completo'; end if;
  insert into public.campaign_members(campaign_id,user_id,member_role) values(p_campaign_id,target,target_role) on conflict(campaign_id,user_id) do update set member_role=excluded.member_role;
 else raise exception 'Operación inválida'; end if;
 insert into admin_vault.audit_events(actor_user_id,actor_role,action,entity_type,entity_id,campaign_id,before_state,after_state,reason)
 values(p_actor_user_id,'campaign_admin','TEAM_'||upper(p_operation),'CAMPAIGN_MEMBER',target::text,p_campaign_id,to_jsonb(previous),jsonb_build_object('member_role',case when p_operation='remove' then null else target_role end),'Gestión de equipo por el administrador del cliente');
 return jsonb_build_object('saved',true);
end $$;
revoke all on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_campaign_team_v1(uuid,uuid,text,jsonb) to service_role;
