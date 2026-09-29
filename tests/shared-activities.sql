-- Run in QA/authorized project. All fixtures and activities roll back.
begin;
select set_config('radar.test.actor',(select user_id::text from public.profiles where is_active and platform_role='platform_admin' limit 1),true);
insert into campaign_vault.contacts(campaign_id,full_name,contact_type,active,candidate_position)
select id,'QA candidato transaccional','Candidato',true,'Alcalde' from public.campaigns where status='active' and not is_demo limit 1;
set local role service_role;
do $$
declare actor uuid:=current_setting('radar.test.actor')::uuid; real_id uuid; demo_id uuid; candidate uuid; input jsonb; result jsonb; batch uuid:=gen_random_uuid(); n integer;
begin
 select id,campaign_id into candidate,real_id from campaign_vault.contacts where full_name='QA candidato transaccional';
 select c.id into demo_id from public.campaigns c where status='active' and is_demo and not exists(select 1 from demo_vault.contacts d where d.campaign_id=c.id and d.active and d.contact_type='Candidato') limit 1;
 if real_id is null or demo_id is null then raise exception 'Missing QA fixture campaigns';end if;
 input:=jsonb_build_object('request_id',batch,'title','QA actividad rollback','activity_type','ASAMBLEA','starts_at','2026-10-01T10:00:00-06:00','is_demo',false,'campaign_ids',jsonb_build_array(real_id));
 result:=public.radar_admin_shared_activities_v1(actor,'create',input);
 if result<>public.radar_admin_shared_activities_v1(actor,'create',input) or (result->>'created')::int<>1 then raise exception 'idempotency failed';end if;
 select count(*) into n from campaign_vault.activities where details->>'admin_activity_batch_id'=batch::text and details->'participant_ids' ? candidate::text;
 if n<>1 then raise exception 'candidate association failed';end if;
 if exists(select 1 from demo_vault.activities where details->>'admin_activity_batch_id'=batch::text) then raise exception 'demo isolation failed';end if;
 begin
  perform public.radar_admin_shared_activities_v1(actor,'create',input||jsonb_build_object('request_id',gen_random_uuid(),'campaign_ids',jsonb_build_array(real_id,demo_id)));
  raise exception 'mixed environments accepted';
 exception when others then if sqlerrm='mixed environments accepted' then raise;end if;end;
 batch:=gen_random_uuid();
 result:=public.radar_admin_shared_activities_v1(actor,'create',input||jsonb_build_object('request_id',batch,'campaign_ids',jsonb_build_array(demo_id),'is_demo',true));
 if (result->>'without_candidates')::int<>1 then raise exception 'empty candidates failed';end if;
 if not exists(select 1 from demo_vault.activities where details->>'admin_activity_batch_id'=batch::text and details->'participant_ids'='[]'::jsonb and details->>'responsible_person_id'='') then raise exception 'empty fields incorrect';end if;
end $$;
rollback;
select has_function_privilege('authenticated','public.radar_admin_shared_activities_v1(uuid,text,jsonb)','EXECUTE') as client_can_broadcast;
