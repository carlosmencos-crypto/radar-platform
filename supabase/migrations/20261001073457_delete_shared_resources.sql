create or replace function public.radar_admin_delete_resource_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare target admin_vault.shared_content;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 if p_input->>'confirmation' is distinct from 'ELIMINAR' then raise exception 'Escribí ELIMINAR para confirmar'; end if;
 select * into target from admin_vault.shared_content where id=(p_input->>'id')::uuid and kind='resource' for update;
 if not found then raise exception 'Recurso inexistente'; end if;
 if target.status<>'ARCHIVED' then raise exception 'Retira el recurso antes de eliminar su archivo'; end if;
 delete from admin_vault.shared_content where id=target.id;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'DELETE_RESOURCE','SHARED_CONTENT',target.id::text,null,jsonb_build_object('deleted',true),'Eliminación definitiva de recurso confirmada');
 return jsonb_build_object('deleted',true,'id',target.id);
end $$;
revoke all on function public.radar_admin_delete_resource_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_delete_resource_v1(uuid,text,jsonb) to service_role;
