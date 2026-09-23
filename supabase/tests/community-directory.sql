-- Run inside BEGIN / ROLLBACK; no private identities are returned or changed.
create temp table community_qa_result (municipalities integer, max_query_ms numeric, miraflores_rows integer) on commit drop;
do $test$
declare samples jsonb; sample jsonb; page jsonb; next_page jsonb;
  checked integer:=0; started timestamptz; max_ms numeric:=0; elapsed numeric;
  miraflores integer; counted jsonb;
begin
  select jsonb_agg(jsonb_build_object('code',s.municipality_code,'community',s.communities->>0))
    into samples from campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources source on source.id=s.source_id and source.active;
  if jsonb_array_length(samples)<>340 then raise exception 'Expected 340 active municipal sources'; end if;
  perform set_config('request.jwt.claim.sub','7e3eca65-d75b-4542-a581-613fa6eddf07',true);
  set local role authenticated;
  for sample in select value from jsonb_array_elements(samples) loop
    if sample->>'community' is null then raise exception 'Missing community sample'; end if;
    started:=clock_timestamp();
    page:=public.radar_authorized_contact_directory_page_v1(sample->>'code',p_community=>sample->>'community',p_limit=>2);
    elapsed:=extract(epoch from clock_timestamp()-started)*1000;
    max_ms:=greatest(max_ms,elapsed);
    if jsonb_array_length(page->'items')=0 or exists(select 1 from jsonb_array_elements(page->'items') row
      where row->>'community'<>sample->>'community' or row->>'municipality_code'<>sample->>'code') then
      raise exception 'Community or municipal scope failed for %',sample->>'code';
    end if;
    if elapsed>=8000 then raise exception 'Community page exceeds API time budget for %',sample->>'code'; end if;
    checked:=checked+1;
  end loop;
  page:=public.radar_authorized_contact_directory_page_v1('0101',p_community=>'COLONIA MIRAFLORES',p_limit=>25);
  miraflores:=jsonb_array_length(page->'items');
  if miraflores<>25 then raise exception 'Miraflores first page failed'; end if;
  next_page:=public.radar_authorized_contact_directory_page_v1('0101',p_community=>'COLONIA MIRAFLORES',p_offset=>25,p_limit=>25);
  if exists(select 1 from jsonb_array_elements(page->'items') a join jsonb_array_elements(next_page->'items') b on a->>'id'=b->>'id') then
    raise exception 'Community pagination repeats records';
  end if;
  counted:=public.radar_authorized_nominal_directory_v1('0101',p_community=>'COLONIA MIRAFLORES',p_limit=>1);
  if (counted->>'total_count')::integer<miraflores then raise exception 'Community exact count inconsistent'; end if;
  page:=public.radar_authorized_contact_directory_page_v1('0101',p_community=>'__QA_NONEXISTENT_COMMUNITY__');
  if jsonb_array_length(page->'items')<>0 or (page->>'has_more')::boolean or (page->>'total_count')::integer<>0 then
    raise exception 'Empty community result incorrect';
  end if;
  reset role;
  insert into community_qa_result values(checked,round(max_ms,3),miraflores);
end;
$test$;
select *,true as scope_and_pagination_passed from community_qa_result;
