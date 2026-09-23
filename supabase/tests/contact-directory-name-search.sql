-- Run within a transaction; no private records or identifiers are returned.
do $test$
declare
  code text;
  forward_page jsonb;
  reverse_page jsonb;
  counted jsonb;
  page_two jsonb;
  denied boolean := false;
begin
  perform set_config('request.jwt.claim.sub','7e3eca65-d75b-4542-a581-613fa6eddf07',true);
  set local role authenticated;
  foreach code in array array['0101','0509','1208'] loop
    forward_page:=public.radar_authorized_contact_directory_page_v1(code,p_query=>'Mencos Carlos',p_limit=>2);
    reverse_page:=public.radar_authorized_contact_directory_page_v1(code,p_query=>'  CARLOS,  MENCOS  ',p_limit=>2);
    if forward_page <> reverse_page then raise exception 'Order/spacing/case changed results in %',code; end if;
    if exists(select 1 from jsonb_array_elements(forward_page->'items') i
      where i->>'municipality_code'<>code or lower(i->>'full_name') not like '%mencos%'
        or lower(i->>'full_name') not like '%carlos%') then
      raise exception 'Name tokens or municipality not respected in %',code;
    end if;
    counted:=public.radar_authorized_nominal_directory_v1(code,p_query=>'Carlos Mencos',p_limit=>2);
    if (select coalesce(jsonb_agg(i->'id'),'[]') from jsonb_array_elements(counted->'items') i)
      <> (select coalesce(jsonb_agg(i->'id'),'[]') from jsonb_array_elements(forward_page->'items') i) then
      raise exception 'Counted and fast pages disagree in %',code;
    end if;
    if code='0509' and (counted->>'total_count')::integer=0 then raise exception 'Expected sample query has no matches'; end if;
    if (forward_page->>'has_more')::boolean then
      page_two:=public.radar_authorized_contact_directory_page_v1(code,p_query=>'Carlos Mencos',p_offset=>2,p_limit=>2);
      if exists(select 1 from jsonb_array_elements(forward_page->'items') a
        join jsonb_array_elements(page_two->'items') b on a->>'id'=b->>'id') then
        raise exception 'Pagination duplicates in %',code;
      end if;
    end if;
    if jsonb_array_length(public.radar_authorized_contact_directory_page_v1(code,p_query=>'Mencos %_') -> 'items')<>0 then
      raise exception 'Search treats user wildcards as patterns';
    end if;
  end loop;
  begin
    perform public.radar_authorized_contact_directory_page_v1('9999',p_query=>'Carlos Mencos');
  exception when insufficient_privilege then denied:=true;
  end;
  if not denied then raise exception 'Unknown municipality authorized'; end if;
  reset role;
  if has_function_privilege('anon','public.radar_authorized_contact_directory_page_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer)','EXECUTE') then
    raise exception 'Anonymous access enabled';
  end if;
end;
$test$;
select true as unordered_search_passed, true as municipality_isolation_passed,
  true as count_and_pagination_passed, true as literal_wildcards_passed;
