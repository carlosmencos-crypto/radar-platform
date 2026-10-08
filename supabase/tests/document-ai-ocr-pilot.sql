begin;
do $$
declare a record; b record; r jsonb; original_enabled boolean;
begin
  if has_table_privilege('anon','public.radar_ocr_jobs','SELECT') or has_table_privilege('authenticated','public.radar_ocr_jobs','SELECT') then raise exception 'OCR data exposed'; end if;
  if has_function_privilege('authenticated','public.radar_ocr_reserve_v1(uuid,uuid,boolean,boolean,text,text)','EXECUTE') then raise exception 'OCR budget exposed'; end if;
  select * into a from public.day_d_jrv_assignments where active and is_demo and campaign_id in(select id from public.campaigns where status='active' and is_demo) limit 1;
  select * into b from public.day_d_jrv_assignments where active and is_demo and campaign_id<>a.campaign_id and campaign_id in(select id from public.campaigns where status='active' and is_demo) limit 1;
  if a.id is null or b.id is null then raise exception 'Need two demo assignments for rollback-only test'; end if;
  update public.radar_ocr_budget set enabled=false;
  r:=public.radar_ocr_reserve_v1(a.campaign_id,a.id,true,false,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'DISABLED' then raise exception 'Disabled gate failed'; end if;
  update public.radar_ocr_budget set enabled=true,demo_only=true,page_limit=2,reserved_pages=0;
  r:=public.radar_ocr_reserve_v1(a.campaign_id,a.id,false,false,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'DEMO_ONLY' then raise exception 'Real access allowed in pilot'; end if;
  begin
    perform public.radar_ocr_reserve_v1(b.campaign_id,a.id,true,false,'PRESIDENTE',repeat('b',64));
    raise exception 'Cross campaign accepted';
  exception when others then if sqlerrm<>'OCR_SCOPE_INVALID' then raise; end if; end;
  r:=public.radar_ocr_reserve_v1(a.campaign_id,a.id,true,false,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'RESERVED' then raise exception 'First reservation failed %',r; end if;
  r:=public.radar_ocr_reserve_v1(a.campaign_id,a.id,true,false,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'PENDING' or (select reserved_pages from public.radar_ocr_budget)<>1 then raise exception 'Duplicate charged twice'; end if;
  r:=public.radar_ocr_reserve_v1(b.campaign_id,b.id,true,false,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'RESERVED' then raise exception 'Same photo in another campaign incorrectly shared'; end if;
  r:=public.radar_ocr_reserve_v1(a.campaign_id,a.id,true,true,'PRESIDENTE',repeat('a',64));
  if r->>'state'<>'LIMIT' then raise exception 'Cap exceeded or test data reused'; end if;
end $$;
rollback;
select 'OCR_SCOPE_DEDUP_BUDGET_RLS_OK' as result;
