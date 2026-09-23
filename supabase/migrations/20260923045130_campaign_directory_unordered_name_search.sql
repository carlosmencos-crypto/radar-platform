-- Align existing campaign directories with national unordered literal-name search.
-- Preserve both deployed signatures, municipality/member authorization, RLS and grants.
do $migration$
declare
  target regprocedure;
  definition text;
  old_predicate text := $old$(nullif(btrim(p_query),'') is null
      or lower(v.full_name) like '%'||lower(btrim(p_query))||'%'
      or lower(v.full_name) operator(extensions.%) lower(btrim(p_query)))$old$;
  new_predicate text := $new$(
      coalesce(cardinality((select patterns from name_input)),0)=0
      or (lower(v.full_name) like (select patterns[1] from name_input)
        and (coalesce(cardinality((select patterns from name_input)),0)<2
          or lower(v.full_name) like (select patterns[2] from name_input))
        and lower(v.full_name) like all((select patterns from name_input)::text[])))$new$;
  name_cte text := $cte$with name_input as materialized (
    select array_agg('%'||replace(replace(replace(term,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' order by length(term) desc,term) as patterns,
      string_agg(term,' ' order by term) as normalized_query
    from (select distinct lower(word) as term
      from regexp_split_to_table(coalesce(p_query,''),'[[:space:],]+') words(word)
      where word<>'') tokens
  ), input_state as materialized ($cte$;
  applied integer := 0;
begin
  for target in
    select p.oid::regprocedure from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='radar_authorized_voter_directory_v1'
      and p.pronargs in (11,12) and not p.prosecdef
  loop
    definition := pg_get_functiondef(target);
    if (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate) <> 1
      or position('with input_state as materialized (' in definition)=0 then
      raise exception 'Unexpected campaign directory definition: %',target;
    end if;
    definition := replace(definition,old_predicate,new_predicate);
    definition := replace(definition,'with input_state as materialized (',name_cte);
    definition := replace(definition,'similarity(lower(v.full_name),lower(btrim(p_query)))',
      'similarity(lower(v.full_name),(select normalized_query from name_input))');
    execute definition;
    applied := applied + 1;
  end loop;
  if applied <> 2 then raise exception 'Expected two existing directory signatures, found %',applied; end if;
end;
$migration$;
