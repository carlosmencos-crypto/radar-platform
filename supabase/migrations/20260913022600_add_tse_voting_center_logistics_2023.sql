create table if not exists data_vault.tse_voting_center_logistics_2023 (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'GT',
  municipality_id uuid not null references public.municipalities(id) on delete cascade,
  source_row integer not null,
  grouping_codes text,
  community text,
  center_correlative integer not null,
  center_name text not null,
  address text,
  zone text,
  registered_voters integer,
  jrv_initial integer,
  jrv_final integer,
  jrv_total integer not null,
  institution text,
  source_id text not null,
  period text not null default '2023',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_id, source_row)
);

create index if not exists tse_voting_center_logistics_2023_municipality_idx
  on data_vault.tse_voting_center_logistics_2023(municipality_id, center_correlative);

alter table data_vault.tse_voting_center_logistics_2023 enable row level security;

drop policy if exists tse_voting_center_logistics_authorized_read on data_vault.tse_voting_center_logistics_2023;
create policy tse_voting_center_logistics_authorized_read
  on data_vault.tse_voting_center_logistics_2023
  for select
  to authenticated
  using (private.can_read_data_vault(country_code, municipality_id));

revoke all on data_vault.tse_voting_center_logistics_2023 from anon;
grant select on data_vault.tse_voting_center_logistics_2023 to authenticated;