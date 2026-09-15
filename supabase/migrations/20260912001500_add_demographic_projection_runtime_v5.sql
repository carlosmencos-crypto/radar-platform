create table if not exists data_vault.municipality_demographic_aggregates (
  municipality_id uuid not null references public.municipalities(id) on delete restrict,
  projection_year integer not null,
  reference_date date not null,
  population_total integer not null,
  population_male integer not null,
  population_female integer not null,
  source_product_id text not null,
  source_label text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (municipality_id, projection_year, source_product_id),
  check (projection_year between 2000 and 2100),
  check (population_total >= 0 and population_male >= 0 and population_female >= 0),
  check (population_total = population_male + population_female)
);

alter table data_vault.municipality_demographic_aggregates enable row level security;
revoke all on data_vault.municipality_demographic_aggregates from anon, authenticated;
grant select on data_vault.municipality_demographic_aggregates to authenticated;

drop policy if exists municipality_demographic_aggregates_read on data_vault.municipality_demographic_aggregates;
create policy municipality_demographic_aggregates_read
on data_vault.municipality_demographic_aggregates
for select
to authenticated
using (private.can_read_data_vault('GT', municipality_id));

create or replace function public.radar_authorized_demographic_summary_v1(p_municipality_code text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  select jsonb_build_object(
    'municipality_code', m.municipality_code,
    'projection_year', d.projection_year,
    'reference_date', d.reference_date,
    'population_total', d.population_total,
    'population_male', d.population_male,
    'population_female', d.population_female,
    'source_product_id', d.source_product_id,
    'source_label', d.source_label
  )
  from public.municipalities m
  join data_vault.municipality_demographic_aggregates d on d.municipality_id = m.id
  where m.country_code = 'GT'
    and m.municipality_code = p_municipality_code
    and d.projection_year = 2026
    and d.source_product_id = 'GT_INE_PROYECCIONES_MUNICIPALES_2015_2030_SEXO_v1'
  limit 1;
$$;

revoke all on function public.radar_authorized_demographic_summary_v1(text) from public, anon;
grant execute on function public.radar_authorized_demographic_summary_v1(text) to authenticated;

create or replace function public.radar_authorized_runtime_v5(p_municipality_code text)
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public, data_vault, private, pg_temp
as $$
  with base as (
    select public.radar_authorized_runtime_v4(p_municipality_code) as value
  ),
  demographics as (
    select public.radar_authorized_demographic_summary_v1(p_municipality_code) as value
  )
  select case
    when b.value is null then null
    else b.value || jsonb_build_object('demographics', d.value)
  end
  from base b
  cross join demographics d;
$$;

revoke all on function public.radar_authorized_runtime_v5(text) from public, anon;
grant execute on function public.radar_authorized_runtime_v5(text) to authenticated;
