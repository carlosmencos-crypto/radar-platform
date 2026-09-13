create table if not exists data_vault.tse_active_voter_profiles_2026 (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'GT',
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  cutoff_at timestamptz not null,
  total_active integer not null,
  women_active integer not null,
  men_active integer not null,
  women_literate integer not null,
  women_illiterate integer not null,
  men_literate integer not null,
  men_illiterate integer not null,
  age_total jsonb not null,
  age_women jsonb not null,
  age_men jsonb not null,
  source_id text not null,
  source_label text not null,
  source_status text not null default 'VALIDATED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (municipality_id, cutoff_at, source_id)
);

create index if not exists tse_active_voter_profiles_2026_municipality_idx
  on data_vault.tse_active_voter_profiles_2026(municipality_id);

alter table data_vault.tse_active_voter_profiles_2026 enable row level security;

drop policy if exists tse_active_voter_profiles_2026_authorized_read on data_vault.tse_active_voter_profiles_2026;
create policy tse_active_voter_profiles_2026_authorized_read
  on data_vault.tse_active_voter_profiles_2026
  for select
  to authenticated
  using (private.can_read_data_vault(country_code, municipality_id));

revoke all on data_vault.tse_active_voter_profiles_2026 from anon;
grant select on data_vault.tse_active_voter_profiles_2026 to authenticated;

create or replace function public.radar_authorized_active_voter_profile_v1(p_municipality_code text)
returns jsonb
language sql
stable
set search_path to 'pg_catalog', 'public', 'data_vault', 'private', 'pg_temp'
as $function$
  select to_jsonb(x)
  from (
    select
      m.municipality_code,
      p.cutoff_at,
      p.total_active,
      p.women_active,
      p.men_active,
      p.women_literate,
      p.women_illiterate,
      p.men_literate,
      p.men_illiterate,
      p.age_total,
      p.age_women,
      p.age_men,
      p.source_id,
      p.source_label,
      p.source_status
    from data_vault.tse_active_voter_profiles_2026 p
    join public.municipalities m on m.id = p.municipality_id
    where m.country_code = 'GT'
      and m.municipality_code = p_municipality_code
    order by p.cutoff_at desc
    limit 1
  ) x;
$function$;

revoke all on function public.radar_authorized_active_voter_profile_v1(text) from public;
grant execute on function public.radar_authorized_active_voter_profile_v1(text) to authenticated;