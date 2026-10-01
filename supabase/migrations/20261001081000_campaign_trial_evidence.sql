CREATE OR REPLACE FUNCTION private.can_read_rtd_evidence(p_bucket text, p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
select auth.uid() is not null and exists (
 select 1 from public.day_d_evidence e
 join public.day_d_rtd_folios f on f.id=e.subject_id and e.subject_type='RTD' and f.campaign_id=e.campaign_id
 join public.day_d_jrv_assignments a on a.id=e.assignment_id and a.id=f.assignment_id and a.campaign_id=e.campaign_id
 join public.campaigns c on c.id=e.campaign_id and c.status='active'
 where e.bucket_id=p_bucket and e.object_path=p_path and f.is_demo=c.is_demo and a.is_demo=c.is_demo
 
 and ((c.is_demo and private.can_use_demo_campaign(c.id))
 or (not c.is_demo and private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer'])))
);
$function$
;
CREATE OR REPLACE FUNCTION private.radar_rtd_evidence_list_v1(p_campaign_id uuid, p_offset integer DEFAULT 0)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'private', 'pg_temp'
AS $function$
begin
 if auth.uid() is null or not exists (
  select 1 from public.campaigns c where c.id=p_campaign_id and c.status='active'
  and ((c.is_demo and private.can_use_demo_campaign(c.id)) or
  (not c.is_demo and private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer'])))
 ) then raise exception 'Campaign not authorized' using errcode='42501'; end if;
 return coalesce((select jsonb_agg(to_jsonb(rows)) from (
  select e.id,e.subject_id as folio_id,e.bucket_id,e.object_path,e.file_name,e.mime_type,e.file_size,
   f.election_type,f.jrv_number,f.municipality_code,m.municipality_name,a.center_name,f.status,f.is_test
  from public.day_d_evidence e
  join public.day_d_rtd_folios f on f.id=e.subject_id and f.campaign_id=e.campaign_id and e.subject_type='RTD'
  join public.day_d_jrv_assignments a on a.id=e.assignment_id and a.id=f.assignment_id and a.campaign_id=e.campaign_id
  join public.campaigns c on c.id=e.campaign_id
  join public.municipalities m on m.id=c.municipality_id
  where e.campaign_id=p_campaign_id and f.is_demo=c.is_demo and a.is_demo=c.is_demo 
  order by f.jrv_number,f.election_type,e.id limit 500 offset greatest(coalesce(p_offset,0),0)
 ) rows),'[]'::jsonb);
end;
$function$
;

