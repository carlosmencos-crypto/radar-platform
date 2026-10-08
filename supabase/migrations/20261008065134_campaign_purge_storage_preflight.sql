-- Storage bytes must be deleted through the Storage API, never through SQL.
-- Only the authenticated admin service can request this exact campaign manifest.
create or replace function public.radar_admin_prepare_campaign_purge_v1(
 p_actor_user_id uuid, p_actor_role text, p_input jsonb
) returns jsonb language plpgsql security definer
set search_path to pg_catalog, public, admin_vault, pg_temp
as $$
declare target public.campaigns; municipality public.municipalities; objects jsonb;
begin
 if p_actor_role is distinct from 'super_admin' then
  raise exception 'Solo superadministradores' using errcode='42501';
 end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id
   and raw_app_meta_data->>'platform_role'='super_admin') then
  raise exception 'Actor no autorizado' using errcode='42501';
 end if;
 select * into target from public.campaigns
 where id=(p_input->>'campaign_id')::uuid and not is_demo;
 if not found then raise exception 'Selecciona una campaña real existente'; end if;
 select * into municipality from public.municipalities where id=target.municipality_id for update;
 select * into target from public.campaigns where id=target.id and not is_demo for update;
 if not found then raise exception 'La campaña ya no existe'; end if;
 if p_input->>'confirmation' is distinct from 'ELIMINAR '||municipality.municipality_code
   or p_input->>'acknowledge' is distinct from 'yes' then
  raise exception 'Confirma el código del municipio y la eliminación definitiva';
 end if;
 -- Block new member and fiscal uploads while the API removes physical files.
 -- Retry is safe: a failed cleanup leaves the campaign paused and available to admins.
 update public.campaigns set status='paused' where id=target.id;
 select coalesce(jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'object_path',o.name)
   order by o.bucket_id,o.name),'[]'::jsonb) into objects
 from storage.objects o
 where (o.bucket_id='radar-campaign-vault' and split_part(o.name,'/',1)=target.id::text)
    or (o.bucket_id='radar-day-d-evidence' and split_part(o.name,'/',1)=municipality.municipality_code
       and split_part(o.name,'/',2)=target.id::text);
 return jsonb_build_object('campaign_id',target.id,'objects',objects);
end $$;
revoke all on function public.radar_admin_prepare_campaign_purge_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_prepare_campaign_purge_v1(uuid,text,jsonb) to service_role;
