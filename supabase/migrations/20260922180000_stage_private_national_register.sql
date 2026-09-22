-- Private source recovery. No campaign rows or existing RPCs are replaced.
-- Activation is a separate, reviewed action after full reconciliation.
create table campaign_vault.national_register_sources (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  source_sha256 text not null unique check (source_sha256 ~ '^[a-f0-9]{64}$'),
  source_year integer not null check (source_year = 2023),
  expected_rows bigint not null check (expected_rows > 0),
  active boolean not null default false,
  token_sha256 text not null check (token_sha256 ~ '^[a-f0-9]{64}$'),
  import_expires_at timestamptz not null,
  import_closed_at timestamptz,
  created_at timestamptz not null default now()
);
create table campaign_vault.national_register_batches (
  source_id uuid not null references campaign_vault.national_register_sources(id),
  batch_number integer not null check (batch_number > 0),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  expected_rows integer not null check (expected_rows between 1 and 10000),
  loaded_at timestamptz,
  primary key (source_id, batch_number)
);
create table campaign_vault.national_register_2023 (
  source_id uuid not null references campaign_vault.national_register_sources(id),
  id bigint not null check (id > 0),
  municipality_id uuid not null references public.municipalities(id),
  municipality_code text not null check (municipality_code ~ '^[0-9]{4}$'),
  community text not null,
  full_name text not null check (length(full_name) > 0),
  age_base integer,
  identification text not null check (identification ~ '^[0-9]{13}$'),
  source_file_id smallint not null,
  source_row integer not null check (source_row > 1),
  primary key (source_id, id)
);
create index national_register_2023_municipality_idx
  on campaign_vault.national_register_2023(municipality_id, id);
create table campaign_vault.national_register_municipal_stats (
  source_id uuid not null references campaign_vault.national_register_sources(id),
  municipality_id uuid not null references public.municipalities(id),
  municipality_code text not null,
  total_count bigint not null check (total_count > 0),
  primary key(source_id, municipality_id)
);

alter table campaign_vault.national_register_sources enable row level security;
alter table campaign_vault.national_register_batches enable row level security;
alter table campaign_vault.national_register_2023 enable row level security;
alter table campaign_vault.national_register_municipal_stats enable row level security;
revoke all on campaign_vault.national_register_sources,
  campaign_vault.national_register_batches, campaign_vault.national_register_2023,
  campaign_vault.national_register_municipal_stats from public, anon, authenticated;

create function public.radar_ingest_private_register_batch_v1(
  p_source_id uuid, p_token text, p_batch_number integer, p_payload text
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  source_row campaign_vault.national_register_sources%rowtype;
  batch_row campaign_vault.national_register_batches%rowtype;
  body jsonb;
  actual_rows integer;
begin
  select * into source_row from campaign_vault.national_register_sources where id=p_source_id;
  if p_token is null or source_row.id is null or source_row.import_closed_at is not null
    or source_row.import_expires_at <= now()
    or source_row.token_sha256 <> encode(extensions.digest(p_token, 'sha256'), 'hex') then
    raise exception 'Import authorization unavailable' using errcode='42501';
  end if;
  select * into batch_row from campaign_vault.national_register_batches
    where source_id=p_source_id and batch_number=p_batch_number for update;
  if batch_row.source_id is null
    or batch_row.payload_sha256 <> encode(extensions.digest(p_payload, 'sha256'), 'hex') then
    raise exception 'Batch does not match registered source manifest';
  end if;
  if batch_row.loaded_at is not null then
    return jsonb_build_object('batch',p_batch_number,'rows',batch_row.expected_rows,'already_loaded',true);
  end if;
  -- Stop before an unexpectedly large import can expand the project disk.
  if pg_database_size(current_database()) > 5::bigint*1024*1024*1024 then
    raise exception 'Import paused: database capacity review required';
  end if;
  body := p_payload::jsonb;
  if jsonb_typeof(body) <> 'array' or jsonb_array_length(body) <> batch_row.expected_rows then
    raise exception 'Batch row count mismatch';
  end if;
  insert into campaign_vault.national_register_2023
    (source_id,id,municipality_id,municipality_code,community,full_name,age_base,identification,source_file_id,source_row)
  select p_source_id,r.id,m.id,r.municipality_code,r.community,r.full_name,r.age_base,
    r.identification,r.source_file_id,r.source_row
  from jsonb_to_recordset(body) as r(id bigint,municipality_code text,community text,
    full_name text,age_base integer,identification text,source_file_id smallint,source_row integer)
  join public.municipalities m on m.country_code='GT' and m.municipality_code=r.municipality_code
    and m.is_synthetic=false
  where r.id between 1 and source_row.expected_rows;
  get diagnostics actual_rows = row_count;
  if actual_rows <> batch_row.expected_rows then
    raise exception 'Municipal identity or source row mismatch';
  end if;
  update campaign_vault.national_register_batches set loaded_at=now()
    where source_id=p_source_id and batch_number=p_batch_number;
  return jsonb_build_object('batch',p_batch_number,'rows',actual_rows,'already_loaded',false);
end;
$$;
revoke all on function public.radar_ingest_private_register_batch_v1(uuid,text,integer,text)
  from public,anon,authenticated;
grant execute on function public.radar_ingest_private_register_batch_v1(uuid,text,integer,text) to service_role;
