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
reset role;
do $$
declare n record; actor uuid:=current_setting('radar.test.actor')::uuid; other_user uuid;
begin
 for n in select c.* from admin_vault.shared_content c where title='QA actividad rollback' loop
  if (select count(*) from admin_vault.shared_content where activity_id=n.activity_id and campaign_id=n.campaign_id)<>1 then raise exception 'Duplicate notice';end if;
 end loop;
 select c.* into n from admin_vault.shared_content c join public.campaigns p on p.id=c.campaign_id where c.title='QA actividad rollback' and p.is_demo;
 if n.id is null then raise exception 'Missing demo notice';end if;
 insert into public.campaign_members(campaign_id,user_id,member_role) values(n.campaign_id,actor,'demo_admin') on conflict do nothing;
 perform set_config('request.jwt.claim.sub',actor::text,true);
 if not exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(n.campaign_id)) x where x->>'id'=n.id::text) then raise exception 'Notice invisible';end if;
 if exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(n.campaign_id)) x where x->>'activity_id' is not null and x->>'campaign_id'<>n.campaign_id::text) then raise exception 'Notice campaign leak';end if;
 perform public.radar_ack_notice_v1(n.campaign_id,n.id);
 if exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(n.campaign_id)) x where x->>'id'=n.id::text) then raise exception 'Receipt not honored';end if;
 select user_id into other_user from public.profiles where is_active and user_id<>actor limit 1;
 insert into public.campaign_members(campaign_id,user_id,member_role) values(n.campaign_id,other_user,'demo_viewer') on conflict do nothing;
 perform set_config('request.jwt.claim.sub',other_user::text,true);
 if not exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(n.campaign_id)) x where x->>'id'=n.id::text) then raise exception 'Receipt leaked across users';end if;
 delete from demo_vault.activities where id=n.activity_id;
 if exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(n.campaign_id)) x where x->>'id'=n.id::text) then raise exception 'Deleted activity still advertised';end if;
end $$;
set local role service_role;
do $$
declare b record; result jsonb; actor uuid:=current_setting('radar.test.actor')::uuid;
begin
 for b in select * from admin_vault.shared_activity_batches where input->>'title'='QA actividad rollback' loop
  begin
   perform public.radar_admin_shared_activities_v1(actor,'delete',jsonb_build_object('id',b.id,'confirmation','incorrecta'));
   raise exception 'Confirmation bypass';
  exception when others then if sqlerrm='Confirmation bypass' then raise;end if;end;
  result:=public.radar_admin_shared_activities_v1(actor,'delete',jsonb_build_object('id',b.id,'confirmation','QA actividad rollback'));
  if not (result ? 'deleted') then raise exception 'Delete failed';end if;
  if exists(select 1 from campaign_vault.activities where details->>'admin_activity_batch_id'=b.id::text) or exists(select 1 from demo_vault.activities where details->>'admin_activity_batch_id'=b.id::text) or exists(select 1 from admin_vault.shared_content where activity_batch_id=b.id) then raise exception 'Deletion incomplete';end if;
  if result<>public.radar_admin_shared_activities_v1(actor,'delete',jsonb_build_object('id',b.id)) then raise exception 'Deletion retry failed';end if;
  begin
   perform public.radar_admin_shared_activities_v1(actor,'create',b.input);
   raise exception 'Deleted batch recreated';
  exception when others then if sqlerrm='Deleted batch recreated' then raise;end if;end;
 end loop;
end $$;
rollback;
select has_function_privilege('authenticated','public.radar_admin_shared_activities_v1(uuid,text,jsonb)','EXECUTE') as client_can_broadcast;
