-- Fiscal uploads use RTD as the canonical evidence subject type. Keep the
-- legacy RTD_FOLIO alias readable for older rows.

create or replace function admin_vault.publish_day_d_rtd_folio(
  p_rtd_folio_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
declare
  folio_row public.day_d_rtd_folios%rowtype;
  assignment_row public.day_d_jrv_assignments%rowtype;
  target_schema text;
  mirror_id uuid;
  evidence_count integer;
  vote_rows jsonb;
  folio_payload jsonb;
begin
  select * into folio_row from public.day_d_rtd_folios where id = p_rtd_folio_id;
  if folio_row.id is null then return; end if;

  select * into assignment_row from public.day_d_jrv_assignments where id = folio_row.assignment_id;
  if assignment_row.id is null
     or assignment_row.campaign_id <> folio_row.campaign_id
     or assignment_row.is_demo <> folio_row.is_demo then
    raise exception 'El RTD fiscal no coincide con su asignación Día D';
  end if;

  target_schema := case when folio_row.is_demo then 'demo_vault' else 'campaign_vault' end;

  select coalesce(
    jsonb_agg(jsonb_build_object('option_code', vote.option_code, 'option_label', vote.option_label, 'votes', vote.votes) order by vote.option_code),
    '[]'::jsonb
  ) into vote_rows
  from public.day_d_rtd_votes vote
  where vote.rtd_folio_id = folio_row.id;

  select count(*)::integer into evidence_count
  from public.day_d_evidence
  where subject_type in ('RTD', 'RTD_FOLIO') and subject_id = folio_row.id;

  folio_payload := jsonb_build_object(
    'source_rtd_folio_id', folio_row.id, 'folio', folio_row.folio,
    'assignment_id', folio_row.assignment_id, 'municipality_code', folio_row.municipality_code,
    'center_id', folio_row.center_id, 'center_name', assignment_row.center_name,
    'jrv', folio_row.jrv_number, 'fiscal_id', folio_row.fiscal_person_id,
    'fiscal_name', assignment_row.fiscal_name, 'election_type', folio_row.election_type,
    'catalog_version', folio_row.catalog_version, 'rtd_status', folio_row.status,
    'null_votes', folio_row.null_votes, 'blank_votes', folio_row.blank_votes,
    'total_digitized', folio_row.total_digitized, 'voters_present', folio_row.voters_present,
    'ballots_received', folio_row.ballots_received, 'ballots_unused', folio_row.ballots_unused,
    'observations', folio_row.observations, 'inconsistency', folio_row.inconsistency,
    'submitted_at', folio_row.submitted_at, 'validated_at', folio_row.validated_at,
    'version', folio_row.version, 'evidence_count', evidence_count, 'votes', vote_rows,
    'is_demo', folio_row.is_demo, 'is_test', folio_row.is_test
  );

  execute format(
    'update %I.campaign_records set title=$1, details=$2, status=$3, payload=$4, updated_at=now()
     where campaign_id=$5 and module_key=''dia-d'' and category=''RTD_FOLIO''
       and payload->>''source_rtd_folio_id''=$6 returning id', target_schema
  ) into mirror_id using
    folio_row.folio || ' · ' || replace(folio_row.election_type, '_', ' '),
    assignment_row.center_name || ' · JRV ' || folio_row.jrv_number::text,
    folio_row.status, folio_payload, folio_row.campaign_id, folio_row.id::text;

  if mirror_id is null then
    execute format(
      'insert into %I.campaign_records(campaign_id,module_key,category,title,details,status,payload,created_by)
       values ($1,''dia-d'',''RTD_FOLIO'',$2,$3,$4,$5,null)', target_schema
    ) using folio_row.campaign_id,
      folio_row.folio || ' · ' || replace(folio_row.election_type, '_', ' '),
      assignment_row.center_name || ' · JRV ' || folio_row.jrv_number::text,
      folio_row.status, folio_payload;
  end if;
end;
$$;

revoke all on function admin_vault.publish_day_d_rtd_folio(uuid) from public;

create or replace function admin_vault.sync_day_d_rtd_evidence_dashboard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, admin_vault, campaign_vault, demo_vault, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    if old.subject_type in ('RTD', 'RTD_FOLIO') then
      perform admin_vault.publish_day_d_rtd_folio(old.subject_id);
    end if;
    return old;
  end if;
  if new.subject_type in ('RTD', 'RTD_FOLIO') then
    perform admin_vault.publish_day_d_rtd_folio(new.subject_id);
  end if;
  return new;
end;
$$;

revoke all on function admin_vault.sync_day_d_rtd_evidence_dashboard() from public;

do $$
declare folio_id uuid;
begin
  for folio_id in select id from public.day_d_rtd_folios loop
    perform admin_vault.publish_day_d_rtd_folio(folio_id);
  end loop;
end;
$$;
