-- Run only after activation, inside a transaction with an existing authorized
-- request.jwt.claim.sub and SET LOCAL ROLE authenticated. Emits no names or DPI.
-- The caller must ROLLBACK: reveal auditing is exercised without retaining test
-- audit entries. No source, voter or campaign rows are changed by these checks.
do $verify$
declare
  code text; expected bigint; listing jsonb; page2 jsonb; detail jsonb;
  searched jsonb; identification text; needle text; voter_id bigint;
  availability jsonb; scope_count integer := 0;
begin
  if auth.uid() is null then raise exception 'Authenticated actor required'; end if;
  for code in select municipality_code from public.municipalities
    where country_code='GT' and not is_synthetic
  loop
    availability := public.radar_authorized_nominal_availability_v1(code);
    if availability is null or availability->>'municipality_code' is distinct from code
      or availability->>'available' is distinct from 'true' or availability->>'read_only' is distinct from 'true'
      or availability->>'source_year' is distinct from '2023'
      or (availability->>'total_count')::bigint<=0 then
      raise exception 'National availability check failed for %',code;
    end if;
    scope_count := scope_count+1;
  end loop;
  if scope_count<>340 then raise exception 'Municipal coverage differs from 340'; end if;
  for code,expected in select * from (values
    ('0101',816683::bigint),('0509',36878::bigint),('1208',9406::bigint),('1901',39798::bigint)
  ) samples(code,expected)
  loop
    listing := public.radar_authorized_nominal_directory_v1(code,p_limit=>25);
    if listing->>'municipality_code' is distinct from code or listing->>'source_year' is distinct from '2023'
      or (listing->>'total_count')::bigint<>expected
      or jsonb_array_length(listing->'items')<>25
      or exists(select 1 from jsonb_array_elements(listing->'items') r
        where r->>'municipality_code'<>code or (r->>'id')::bigint>=0
          or r->>'masked_identification' !~ '^•{9}[0-9]{4}$') then
      raise exception 'Directory scope/count/masking failed for %',code;
    end if;
    page2 := public.radar_authorized_nominal_directory_v1(code,p_offset=>25,p_limit=>25);
    if jsonb_array_length(page2->'items')<>25
      or exists(select 1 from jsonb_array_elements(listing->'items') a
        join jsonb_array_elements(page2->'items') b on a->>'id'=b->>'id') then
      raise exception 'Pagination failed for %',code;
    end if;
    voter_id := (listing#>>'{items,0,id}')::bigint;
    detail := public.radar_authorized_nominal_detail_v1(code,voter_id);
    if detail is null or detail->>'read_only' is distinct from 'true'
      or detail#>>'{elector,municipality_code}' is distinct from code
      or (detail#>>'{elector,id}')::bigint<>voter_id then
      raise exception 'Read-only detail failed for %',code;
    end if;
    if public.radar_authorized_nominal_detail_v1(
      case when code='1208' then '0509' else '1208' end,voter_id) is not null then
      raise exception 'Cross-municipality detail was returned';
    end if;
    needle := listing#>>'{items,0,full_name}';
    searched := public.radar_authorized_nominal_directory_v1(code,p_query=>needle);
    if (searched->>'total_count')::bigint<1
      or not exists(select 1 from jsonb_array_elements(searched->'items') r
        where (r->>'id')::bigint=voter_id) then
      raise exception 'Name search failed for %',code;
    end if;
    identification := public.radar_reveal_nominal_identification_v1(code,voter_id);
    if identification is null or identification !~ '^[0-9]{13}$'
      or right(identification,4)<>right(listing#>>'{items,0,masked_identification}',4) then
      raise exception 'Authorized reveal failed for %',code;
    end if;
    searched := public.radar_authorized_nominal_directory_v1(code,p_dpi=>identification);
    if not exists(select 1 from jsonb_array_elements(searched->'items') r
      where (r->>'id')::bigint=voter_id) then
      raise exception 'Exact identity search failed for %',code;
    end if;
    if public.radar_reveal_nominal_identification_v1(
      case when code='1208' then '0509' else '1208' end,voter_id) is not null then
      raise exception 'Cross-municipality identity was returned';
    end if;
  end loop;
end;
$verify$;
select 'PASS' as nominal_runtime_contract,340 as authorized_municipalities,
  4 as sampled_directories,0 as personal_values_returned;
