-- Run within BEGIN / ROLLBACK. Uses the existing canonical folios without changing them.
do $test$
declare
  actor uuid;
  data_mode text;
  election text;
  cycle integer;
  round_no integer;
  result jsonb;
  municipal_votes bigint;
  municipal_received bigint;
  municipal_counted bigint;
  municipal_fiscales bigint;
  result_votes bigint;
  territory_votes bigint;
  checks integer := 0;
begin
  select id into actor from auth.users
  where raw_app_meta_data->>'platform_role' = 'super_admin' limit 1;
  if actor is null then raise exception 'No superadmin actor available'; end if;
  foreach data_mode in array array['REAL', 'DEMO'] loop
    foreach election in array array['CORPORACION_MUNICIPAL', 'DIP_DIST', 'DIP_NAC', 'DIP_PAR', 'PRESIDENTE'] loop
      foreach cycle in array array[2023, 2027] loop
        for round_no in 1..case when election = 'PRESIDENTE' then 2 else 1 end loop
          result := public.radar_admin_national_rtd_v1(actor, 'super_admin',
            jsonb_build_object('election_type', election, 'election_cycle', cycle,
              'election_round', round_no, 'data_mode', data_mode));
          select coalesce(sum((m->>'valid_votes')::bigint), 0),
                 coalesce(sum((m->>'received')::bigint), 0),
                 coalesce(sum((m->>'counted')::bigint), 0),
                 coalesce(sum((m->>'fiscales')::bigint), 0)
          into municipal_votes, municipal_received, municipal_counted, municipal_fiscales
          from jsonb_array_elements(result->'municipalities') m;
          select coalesce(sum((v->>'votes')::bigint), 0) into result_votes
          from jsonb_array_elements(result->'results') v;
          select coalesce(sum((t->>'valid_votes')::bigint), 0) into territory_votes
          from jsonb_array_elements(result->'territories') t;
          if municipal_votes is distinct from (result->'summary'->>'valid_votes')::bigint
             or municipal_received is distinct from (result->'summary'->>'received')::bigint
             or municipal_counted is distinct from (result->'summary'->>'counted')::bigint
             or municipal_fiscales is distinct from (result->'summary'->>'fiscales')::bigint
             or result_votes is distinct from municipal_votes
             or territory_votes is distinct from municipal_votes then
            raise exception 'National/municipal RTD mismatch: % % % round %; municipal votes %, summary %',
              data_mode, election, cycle, round_no, municipal_votes, result->'summary';
          end if;
          checks := checks + 1;
        end loop;
      end loop;
    end loop;
  end loop;
  if checks <> 24 then raise exception 'Expected 24 scopes; checked %', checks; end if;
end;
$test$;
