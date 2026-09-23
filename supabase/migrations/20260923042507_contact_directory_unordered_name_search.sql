-- Require every name fragment in any order, keeping municipal authorization,
-- literal LIKE escaping, the existing trigram index, and identical count/page filters.
do $migration$
declare
  target text;
  definition text;
  old_predicate text := $old$(nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')$old$;
  new_predicate text := $new$(cardinality(name_patterns)=0 or (lower(r.full_name) like name_patterns[1] and (cardinality(name_patterns)<2 or lower(r.full_name) like name_patterns[2]) and lower(r.full_name) like all(name_patterns)))$new$;
  declaration text := $declaration$declare
  name_patterns text[] := array(
    select '%' || replace(replace(replace(term,chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_') || '%'
    from (select distinct lower(word) as term
      from regexp_split_to_table(coalesce(p_query,''),'[[:space:],]+') as words(word)
      where word<>'') tokens
    order by length(term) desc,term
  );
$declaration$;
  expected integer;
begin
  foreach target in array array[
    'private.radar_authorized_contact_directory_page_v1',
    'private.radar_authorized_nominal_directory_v1'
  ] loop
    select pg_get_functiondef((target||'(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer)')::regprocedure)
      into strict definition;
    expected := case when target like '%contact_directory_page%' then 1 else 2 end;
    if (length(definition)-length(replace(definition,old_predicate,'')))/length(old_predicate) <> expected
      or position(E'declare\n' in definition)=0 then
      raise exception 'Unexpected directory definition; inspect before changing %',target;
    end if;
    definition:=replace(definition,E'declare\n',declaration);
    definition:=replace(definition,old_predicate,new_predicate);
    execute definition;
  end loop;
end;
$migration$;
