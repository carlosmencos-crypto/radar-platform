begin;

with rebuilt as (
  select
    p.id,
    jsonb_agg(
      case
        when (council->>'year')::integer in (2015, 2019)
         and jsonb_array_length(coalesce(council->'members', '[]'::jsonb)) > 0
        then jsonb_set(
          jsonb_set(
            council,
            '{groups}',
            coalesce((
              select jsonb_agg(
                jsonb_build_object('party', grouped.party, 'seats', grouped.seats)
                order by grouped.seats desc, grouped.party
              )
              from (
                select member->>'party' as party, count(*)::integer as seats
                from jsonb_array_elements(council->'members') member
                where nullif(member->>'party', '') is not null
                  and upper(member->>'office') not like '%SUPLENTE%'
                group by member->>'party'
              ) grouped
            ), '[]'::jsonb),
            true
          ),
          '{titular_total}',
          to_jsonb((
            select count(*)::integer
            from jsonb_array_elements(council->'members') member
            where upper(member->>'office') not like '%SUPLENTE%'
          )),
          true
        ) || jsonb_build_object(
          'substitute_total', (
            select count(*)::integer
            from jsonb_array_elements(council->'members') member
            where upper(member->>'office') like '%SUPLENTE%'
          )
        )
        else council
      end
      order by (council->>'year')::integer
    ) as councils
  from data_vault.municipality_intelligence_profiles_v1 p
  cross join lateral jsonb_array_elements(p.profile->'electoral_history'->'councils') council
  group by p.id
)
update data_vault.municipality_intelligence_profiles_v1 p
set
  profile = jsonb_set(p.profile, '{electoral_history,councils}', rebuilt.councils, true),
  generated_at = now(),
  updated_at = now()
from rebuilt
where p.id = rebuilt.id;

do $$
declare
  valid_profiles integer;
begin
  select count(*) into valid_profiles
  from data_vault.municipality_intelligence_profiles_v1 p
  where jsonb_array_length(p.profile->'electoral_history'->'councils') = 4
    and not exists (
      select 1
      from jsonb_array_elements(p.profile->'electoral_history'->'councils') council
      where (council->>'year')::integer in (2015, 2019)
        and jsonb_array_length(coalesce(council->'members', '[]'::jsonb)) > 0
        and (
          not (council ? 'titular_total')
          or not (council ? 'substitute_total')
        )
    );
  if valid_profiles <> 340 then
    raise exception 'Historical council normalization expected 340 profiles, validated %', valid_profiles;
  end if;
end $$;

commit;

