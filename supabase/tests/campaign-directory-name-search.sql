-- Execute inside BEGIN / ROLLBACK. Only verification booleans are returned.

do $test$
declare a jsonb; b jsonb; full_total bigint; legacy_total bigint;
begin
  perform set_config('request.jwt.claim.sub','7e3eca65-d75b-4542-a581-613fa6eddf07',true);
  set local role authenticated;
  select jsonb_agg(to_jsonb(r) order by r.id),max(r.total_count) into a,full_total
    from public.radar_authorized_voter_directory_v1('0509',p_query=>'Mencos Carlos',p_responsible=>null::uuid,p_limit=>2) r;
  select jsonb_agg(to_jsonb(r) order by r.id) into b
    from public.radar_authorized_voter_directory_v1('0509',p_query=>'  CARLOS, MENCOS ',p_responsible=>null::uuid,p_limit=>2) r;
  if a is null or a<>b or full_total<1 then raise exception 'Campaign name permutation failed'; end if;
  if exists(select 1 from jsonb_array_elements(a) r where lower(r->>'full_name') not like '%mencos%' or lower(r->>'full_name') not like '%carlos%') then
    raise exception 'Campaign name fragments not respected';
  end if;
  select max(r.total_count) into legacy_total from public.radar_authorized_voter_directory_v1('0509','Carlos Mencos',null::text,null::text,null::integer,null::integer,null::text,null::text,null::text,0,2) r;
  if legacy_total is distinct from full_total then raise exception 'Legacy signature differs'; end if;
  if exists(select 1 from public.radar_authorized_voter_directory_v1('0509',p_query=>'Mencos %_',p_responsible=>null::uuid)) then raise exception 'Wildcard was not literal'; end if;
  perform set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
  begin
    if exists(select 1 from public.radar_authorized_voter_directory_v1('0509',p_query=>'Carlos Mencos',p_responsible=>null::uuid)) then
      raise exception 'Unauthorized user obtained records';
    end if;
  exception when insufficient_privilege then null;
  end;
  reset role;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='radar_authorized_voter_directory_v1' and (p.prosecdef or has_function_privilege('anon',p.oid,'execute'))) then
    raise exception 'Campaign invoker/anonymous authorization changed';
  end if;
end;
$test$;
select true as campaign_unordered_search_passed, true as preserved_access_controls;

