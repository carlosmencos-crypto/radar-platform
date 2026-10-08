-- Read-only outcome: all campaign status changes are rolled back. No Storage API calls.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$
declare actor uuid; campaign record; result jsonb; expected bigint; rejected boolean;
begin
 select u.id into strict actor from auth.users u join public.profiles p on p.user_id=u.id
 where u.raw_app_meta_data->>'platform_role'='super_admin' and p.is_active limit 1;
 select c.id,m.municipality_code into strict campaign from public.campaigns c
 join public.municipalities m on m.id=c.municipality_id where not c.is_demo
 and exists(select 1 from storage.objects o where o.name like '%'||c.id::text||'%') limit 1;
 rejected:=false;
 begin
  perform public.radar_admin_prepare_campaign_purge_v1(actor,'super_admin',jsonb_build_object(
   'campaign_id',campaign.id,'confirmation','INCORRECTO','acknowledge','yes'));
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Missing confirmation accepted'; end if;
 rejected:=false;
 begin
  perform public.radar_admin_prepare_campaign_purge_v1(actor,'campaign_admin',jsonb_build_object(
   'campaign_id',campaign.id,'confirmation','ELIMINAR '||campaign.municipality_code,'acknowledge','yes'));
 exception when insufficient_privilege then rejected:=true; end;
 if not rejected then raise exception 'Wrong role accepted'; end if;
 result:=public.radar_admin_prepare_campaign_purge_v1(actor,'super_admin',jsonb_build_object(
   'campaign_id',campaign.id,'confirmation','ELIMINAR '||campaign.municipality_code,'acknowledge','yes'));
 select count(*) into expected from storage.objects where
 (bucket_id='radar-campaign-vault' and split_part(name,'/',1)=campaign.id::text)
 or (bucket_id='radar-day-d-evidence' and split_part(name,'/',1)=campaign.municipality_code and split_part(name,'/',2)=campaign.id::text);
 if jsonb_array_length(result->'objects')<>expected or expected=0 then raise exception 'Incomplete manifest'; end if;
 if exists(select 1 from jsonb_array_elements(result->'objects') o
 where not ((o->>'bucket_id'='radar-campaign-vault' and split_part(o->>'object_path','/',1)=campaign.id::text)
 or (o->>'bucket_id'='radar-day-d-evidence' and split_part(o->>'object_path','/',2)=campaign.id::text))) then
 raise exception 'Manifest crosses campaign boundary'; end if;
 if not exists(select 1 from public.campaigns where id=campaign.id and status='paused') then raise exception 'Uploads not paused'; end if;
 rejected:=false;
 begin
  perform public.radar_admin_purge_campaign_v1(actor,'super_admin',jsonb_build_object(
   'campaign_id',campaign.id,'confirmation','ELIMINAR '||campaign.municipality_code,'acknowledge','yes'));
 exception when others then rejected:=true; end;
 if not rejected then raise exception 'Purged before physical cleanup'; end if;
 if has_function_privilege('authenticated','public.radar_admin_prepare_campaign_purge_v1(uuid,text,jsonb)','EXECUTE')
 or has_function_privilege('anon','public.radar_admin_prepare_campaign_purge_v1(uuid,text,jsonb)','EXECUTE') then
 raise exception 'Manifest exposed to public clients'; end if;
end $$;
rollback;
select 'PASS: exact storage scope, confirmation, role checks, paused uploads and final file guard; no data changed' result;
