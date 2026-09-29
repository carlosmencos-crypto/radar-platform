-- Run inside BEGIN / ROLLBACK. No fixtures are persisted.
do $$
declare file_row record; allowed boolean; result jsonb; tested integer:=0;
begin
 perform set_config('request.jwt.claim.sub','7e3eca65-d75b-4542-a581-613fa6eddf07',true);
 for file_row in select e.*,c.is_demo,c.status as campaign_status,f.is_demo as folio_demo,f.is_test
 from public.day_d_evidence e join public.campaigns c on c.id=e.campaign_id
 join public.day_d_rtd_folios f on f.id=e.subject_id where e.subject_type='RTD' loop
  allowed:=private.can_read_rtd_evidence(file_row.bucket_id,file_row.object_path);
  if file_row.is_demo and file_row.campaign_status='active' and file_row.folio_demo and not file_row.is_test then
   if not allowed then raise exception 'Authorized demo file blocked'; end if;
   result:=public.radar_rtd_evidence_list_v1(file_row.campaign_id);
   if not exists(select 1 from jsonb_array_elements(result) r where r->>'id'=file_row.id::text) then raise exception 'Manifest missing authorized file'; end if;
   tested:=tested+1;
  end if;
 end loop;
 if tested=0 then raise exception 'No authorized fixtures tested'; end if;
 perform set_config('request.jwt.claim.sub',gen_random_uuid()::text,true);
 if exists(select 1 from public.day_d_evidence e where private.can_read_rtd_evidence(e.bucket_id,e.object_path)) then raise exception 'Unrelated user can read evidence'; end if;
 begin
  perform public.radar_rtd_evidence_list_v1((select campaign_id from public.day_d_evidence limit 1));
  raise exception 'Unrelated user can list evidence';
 exception when insufficient_privilege then null; end;
 perform set_config('request.jwt.claim.sub','',true);
 if exists(select 1 from public.day_d_evidence e where private.can_read_rtd_evidence(e.bucket_id,e.object_path)) then raise exception 'Anonymous access'; end if;
end $$;
