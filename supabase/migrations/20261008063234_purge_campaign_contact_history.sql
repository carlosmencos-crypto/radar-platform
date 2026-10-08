CREATE OR REPLACE FUNCTION public.radar_admin_purge_campaign_v1(p_actor_user_id uuid, p_actor_role text, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'admin_vault', 'pg_temp'
AS $function$
declare result jsonb; target uuid:=(p_input->>'campaign_id')::uuid; mail_id uuid;
begin
 perform 1 from public.municipalities m join public.campaigns c on c.municipality_id=m.id where c.id=target for update of m;
 perform 1 from public.campaigns where id=target for update;
 -- Never claim file deletion while physical objects still exist. Storage removal requires its API.
 if exists(select 1 from storage.objects where name like '%'||target::text||'%') then raise exception 'Esta campaña contiene archivos alojados. Retíralos de Storage antes del borrado definitivo.'; end if;
 if exists(select 1 from public.campaign_members where campaign_id=target) then perform admin_vault.archive_campaign_workspace(target); end if;
 -- Directory history is owned by user and municipality rather than campaign_id.
 -- Erase only the departing campaign's users and time window. A later campaign
 -- of the same user/municipality must retain its newer interactions.
 delete from campaign_vault.contact_workspace_interactions interaction
 using public.campaigns campaign
 where campaign.id=target
   and interaction.municipality_id=campaign.municipality_id
   and interaction.created_at<=coalesce(
     (select concluded_at from admin_vault.campaign_archives where campaign_id=target),now())
   and (
     exists(select 1 from public.campaign_members cm
       where cm.campaign_id=target and cm.user_id=interaction.owner_id)
     or exists(select 1 from admin_vault.campaign_archives archive,
       lateral jsonb_array_elements(archive.members) member
       where archive.campaign_id=target and member->>'user_id'=interaction.owner_id::text)
     or exists(select 1 from admin_vault.audit_events event
       where event.campaign_id=target and event.entity_type='CAMPAIGN_MEMBER'
         and (event.before_state->>'user_id'=interaction.owner_id::text
           or event.after_state->>'user_id'=interaction.owner_id::text))
   );
 -- Remove superseded mail payloads before permanent erasure; keep only its delivery receipt.
 delete from admin_vault.lifecycle_mail where campaign_id=target;
 mail_id:=admin_vault.queue_lifecycle_mail(target,'deleted','deleted:'||target);
 result:=public.radar_admin_purge_campaign_core_v1(p_actor_user_id,p_actor_role,p_input);
 return result||jsonb_build_object('mail_id',mail_id);
end $function$;
