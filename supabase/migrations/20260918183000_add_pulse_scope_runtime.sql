-- Pulso Electoral: one source of truth with publication scope enforced server-side.
-- ALCALDIA is municipal, DIP_DIST is departmental, and the remaining elections
-- are national. Clients never receive rows outside their authorized territory.

create table if not exists data_vault.pulse_measurements (
  id uuid primary key default gen_random_uuid(),
  folio text not null unique,
  election_type text not null,
  scope_type text not null,
  country_code text not null default 'GT',
  department_code text,
  municipality_code text,
  field_start date,
  field_end date not null,
  sample_size integer not null,
  scope_label text not null,
  methodology text not null,
  source_label text not null default 'RADAR',
  status text not null default 'BORRADOR',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pulse_measurements_election_check check (
    election_type in ('ALCALDIA','PRESIDENTE','DIP_NAC','DIP_DIST','PARLACEN')
  ),
  constraint pulse_measurements_scope_check check (
    scope_type in ('MUNICIPALITY','DEPARTMENT','NATIONAL')
  ),
  constraint pulse_measurements_status_check check (
    status in ('BORRADOR','PUBLICADA','ARCHIVADA')
  ),
  constraint pulse_measurements_sample_check check (sample_size > 0),
  constraint pulse_measurements_dates_check check (
    field_start is null or field_start <= field_end
  ),
  constraint pulse_measurements_scope_integrity_check check (
    (
      election_type = 'ALCALDIA'
      and scope_type = 'MUNICIPALITY'
      and municipality_code ~ '^[0-9]{4}$'
      and department_code = left(municipality_code, 2)
    )
    or (
      election_type = 'DIP_DIST'
      and scope_type = 'DEPARTMENT'
      and municipality_code is null
      and department_code ~ '^[0-9]{2}$'
    )
    or (
      election_type in ('PRESIDENTE','DIP_NAC','PARLACEN')
      and scope_type = 'NATIONAL'
      and municipality_code is null
      and department_code is null
    )
  )
);

create table if not exists data_vault.pulse_results (
  id bigint generated always as identity primary key,
  measurement_id uuid not null references data_vault.pulse_measurements(id) on delete cascade,
  option_code text not null,
  candidate_name text not null,
  organization text,
  result_value numeric(6,2) not null,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint pulse_results_measurement_option_key unique (measurement_id, option_code),
  constraint pulse_results_value_check check (result_value between 0 and 100)
);

create index if not exists pulse_measurements_visibility_idx
  on data_vault.pulse_measurements (
    status, country_code, scope_type, department_code, municipality_code,
    election_type, field_end desc
  );
create index if not exists pulse_results_measurement_order_idx
  on data_vault.pulse_results (measurement_id, display_order, id);

alter table data_vault.pulse_measurements enable row level security;
alter table data_vault.pulse_results enable row level security;

revoke all on data_vault.pulse_measurements from public, anon, authenticated;
revoke all on data_vault.pulse_results from public, anon, authenticated;
revoke all on sequence data_vault.pulse_results_id_seq from public, anon, authenticated;

create or replace function public.radar_authorized_pulse_v1(
  p_municipality_code text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
declare
  ctx record;
  payload jsonb;
begin
  if p_municipality_code !~ '^[0-9]{4}$' then
    raise exception 'invalid municipality code' using errcode = '22023';
  end if;

  select * into ctx
  from public.radar_authorized_context_v2('municipality', p_municipality_code)
  limit 1;

  if ctx.municipality_code is null or ctx.campaign_id is null then
    raise exception 'pulse access denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', measurement.id,
      'folio', measurement.folio,
      'election_type', measurement.election_type,
      'scope_type', measurement.scope_type,
      'country_code', measurement.country_code,
      'department_code', measurement.department_code,
      'municipality_code', measurement.municipality_code,
      'field_start', measurement.field_start,
      'field_end', measurement.field_end,
      'sample_size', measurement.sample_size,
      'scope_label', measurement.scope_label,
      'methodology', measurement.methodology,
      'source_label', measurement.source_label,
      'results', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'option_code', result.option_code,
            'candidate_name', result.candidate_name,
            'organization', result.organization,
            'value', result.result_value
          ) order by result.display_order, result.id
        )
        from data_vault.pulse_results result
        where result.measurement_id = measurement.id
      ), '[]'::jsonb)
    ) order by measurement.field_end desc, measurement.folio
  ), '[]'::jsonb) into payload
  from data_vault.pulse_measurements measurement
  where measurement.status = 'PUBLICADA'
    and measurement.country_code = ctx.country_code
    and (
      (
        measurement.scope_type = 'MUNICIPALITY'
        and measurement.election_type = 'ALCALDIA'
        and measurement.municipality_code = ctx.municipality_code
      )
      or (
        measurement.scope_type = 'DEPARTMENT'
        and measurement.election_type = 'DIP_DIST'
        and measurement.department_code = ctx.department_code
      )
      or (
        measurement.scope_type = 'NATIONAL'
        and measurement.election_type in ('PRESIDENTE','DIP_NAC','PARLACEN')
      )
    );

  return payload;
end
$$;

create or replace function public.radar_admin_save_pulse_v1(
  p_measurement jsonb,
  p_results jsonb,
  p_measurement_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public, private, data_vault, pg_temp
as $$
declare
  saved data_vault.pulse_measurements;
  election_value text := upper(nullif(btrim(p_measurement->>'election_type'), ''));
  status_value text := upper(coalesce(nullif(btrim(p_measurement->>'status'), ''), 'BORRADOR'));
  municipality_value text := nullif(btrim(p_measurement->>'municipality_code'), '');
  department_value text := nullif(btrim(p_measurement->>'department_code'), '');
  country_value text := upper(coalesce(nullif(btrim(p_measurement->>'country_code'), ''), 'GT'));
  scope_value text;
  result_total numeric;
begin
  if not exists (
    select 1 from public.profiles profile
    where profile.user_id = auth.uid()
      and profile.platform_role = 'platform_admin'
      and profile.is_active = true
  ) then
    raise exception 'pulse administration denied' using errcode = '42501';
  end if;

  if election_value = 'ALCALDIA' then
    scope_value := 'MUNICIPALITY';
    select municipality.country_code, municipality.department_code
      into country_value, department_value
    from public.municipalities municipality
    where municipality.municipality_code = municipality_value;
    if not found then
      raise exception 'unknown municipality scope' using errcode = '22023';
    end if;
  elsif election_value = 'DIP_DIST' then
    scope_value := 'DEPARTMENT';
    municipality_value := null;
    if department_value !~ '^[0-9]{2}$' or not exists (
      select 1 from public.municipalities municipality
      where municipality.country_code = country_value
        and municipality.department_code = department_value
    ) then
      raise exception 'unknown department scope' using errcode = '22023';
    end if;
  elsif election_value in ('PRESIDENTE','DIP_NAC','PARLACEN') then
    scope_value := 'NATIONAL';
    municipality_value := null;
    department_value := null;
  else
    raise exception 'invalid election type' using errcode = '22023';
  end if;

  if jsonb_typeof(p_results) <> 'array' or jsonb_array_length(p_results) < 2 then
    raise exception 'at least two pulse results are required' using errcode = '22023';
  end if;

  select sum(row_value.value) into result_total
  from jsonb_to_recordset(p_results) as row_value(value numeric);
  if result_total is null or result_total < 99 or result_total > 101 then
    raise exception 'pulse results must total approximately 100 percent' using errcode = '22023';
  end if;

  insert into data_vault.pulse_measurements (
    id, folio, election_type, scope_type, country_code, department_code,
    municipality_code, field_start, field_end, sample_size, scope_label,
    methodology, source_label, status, created_by, updated_by
  ) values (
    coalesce(p_measurement_id, gen_random_uuid()),
    nullif(btrim(p_measurement->>'folio'), ''), election_value, scope_value,
    country_value, department_value, municipality_value,
    nullif(p_measurement->>'field_start', '')::date,
    nullif(p_measurement->>'field_end', '')::date,
    nullif(p_measurement->>'sample_size', '')::integer,
    nullif(btrim(p_measurement->>'scope_label'), ''),
    nullif(btrim(p_measurement->>'methodology'), ''),
    coalesce(nullif(btrim(p_measurement->>'source_label'), ''), 'RADAR'),
    status_value, auth.uid(), auth.uid()
  )
  on conflict (id) do update set
    folio = excluded.folio,
    election_type = excluded.election_type,
    scope_type = excluded.scope_type,
    country_code = excluded.country_code,
    department_code = excluded.department_code,
    municipality_code = excluded.municipality_code,
    field_start = excluded.field_start,
    field_end = excluded.field_end,
    sample_size = excluded.sample_size,
    scope_label = excluded.scope_label,
    methodology = excluded.methodology,
    source_label = excluded.source_label,
    status = excluded.status,
    updated_by = auth.uid(),
    updated_at = now()
  returning * into saved;

  delete from data_vault.pulse_results where measurement_id = saved.id;
  insert into data_vault.pulse_results (
    measurement_id, option_code, candidate_name, organization,
    result_value, display_order
  )
  select saved.id, row_value.option_code, row_value.candidate_name,
    nullif(btrim(row_value.organization), ''), row_value.value,
    row_number() over ()
  from jsonb_to_recordset(p_results) as row_value(
    option_code text,
    candidate_name text,
    organization text,
    value numeric
  );

  return jsonb_build_object(
    'id', saved.id,
    'folio', saved.folio,
    'scope_type', saved.scope_type,
    'status', saved.status
  );
end
$$;

revoke all on function public.radar_authorized_pulse_v1(text) from public, anon;
revoke all on function public.radar_admin_save_pulse_v1(jsonb, jsonb, uuid) from public, anon;
grant execute on function public.radar_authorized_pulse_v1(text) to authenticated;
grant execute on function public.radar_admin_save_pulse_v1(jsonb, jsonb, uuid) to authenticated;
