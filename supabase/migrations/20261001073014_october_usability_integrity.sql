CREATE OR REPLACE FUNCTION admin_vault.sync_day_d_campaign_record_access()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'admin_vault', 'campaign_vault', 'demo_vault', 'extensions', 'pg_temp'
AS $function$
declare
  source_row record;
  target_campaign public.campaigns%rowtype;
  assignment_payload jsonb;
  municipality text;
  assignment_record_id uuid;
  fiscal_id uuid;
  v_assignment_id uuid;
  v_grant_id uuid;
  center_id text;
  center_name text;
  center_reference text;
  fiscal_name text;
  responsible_name text;
  jrv_number integer;
  code text;
  v_code_hash text;
  v_link_hash text;
  v_expires_at timestamptz;
  v_grant_status text;
begin
  if tg_op = 'DELETE' then
    if old.module_key = 'dia-d' and old.category = 'ACCESO_FISCAL' then
      v_link_hash := encode(extensions.digest('campaign-record:' || old.id::text, 'sha256'), 'hex');
      update public.day_d_fiscal_access_grants
      set status = 'REVOKED', revoked_at = coalesce(revoked_at, now())
      where day_d_fiscal_access_grants.link_hash = v_link_hash;
    end if;
    return old;
  end if;

  if new.module_key <> 'dia-d' or new.category <> 'ACCESO_FISCAL' then
    return new;
  end if;

  select * into target_campaign
  from public.campaigns
  where id = new.campaign_id and status = 'active';

  if target_campaign.id is null then
    raise exception 'Campaña no encontrada o inactiva';
  end if;
  if (target_campaign.is_demo and tg_table_schema <> 'demo_vault')
     or (not target_campaign.is_demo and tg_table_schema <> 'campaign_vault') then
    raise exception 'El registro Día D no pertenece al entorno de la campaña';
  end if;

  begin
    assignment_record_id := nullif(new.payload->>'assignment_id', '')::uuid;
    fiscal_id := nullif(new.payload->>'fiscal_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Asignación o fiscal inválido';
  end;
  if assignment_record_id is null or fiscal_id is null then
    raise exception 'El acceso fiscal no tiene asignación o fiscal';
  end if;

  execute format(
    'select payload from %I.campaign_records where id=$1 and campaign_id=$2 and module_key=''dia-d'' and category=''ASIGNACION_JRV''',
    tg_table_schema
  ) into assignment_payload using assignment_record_id, new.campaign_id;
  if assignment_payload is null then
    raise exception 'La asignación JRV vinculada no existe';
  end if;

  select m.municipality_code into municipality
  from public.municipalities m
  where m.id = target_campaign.municipality_id;
  if municipality is null or municipality !~ '^[0-9]{4}$' then
    raise exception 'La campaña no tiene municipio válido';
  end if;

  center_id := coalesce(nullif(new.payload->>'center_id', ''), nullif(assignment_payload->>'center_id', ''));
  center_name := coalesce(nullif(assignment_payload->>'center_name', ''), 'Centro ' || center_id);
  center_reference := coalesce(nullif(assignment_payload->>'center_reference', ''), 'Asignación RADAR');
  fiscal_name := coalesce(nullif(assignment_payload->>'fiscal_name', ''), 'Fiscal asignado');
  responsible_name := coalesce(nullif(assignment_payload->>'center_responsible_name', ''), 'Pendiente de asignar');
  if center_id is null then raise exception 'El acceso fiscal no tiene centro'; end if;

  begin
    jrv_number := regexp_replace(
      coalesce(nullif(new.payload->>'jrv', ''), assignment_payload->>'jrv', ''),
      '[^0-9]', '', 'g'
    )::integer;
  exception when invalid_text_representation or numeric_value_out_of_range then
    raise exception 'El acceso fiscal no tiene una JRV válida';
  end;
  if jrv_number is null or jrv_number <= 0 then
    raise exception 'El acceso fiscal no tiene una JRV válida';
  end if;

  insert into public.day_d_jrv_assignments(
    source_assignment_id, campaign_id, municipality_code, is_demo,
    center_id, center_name, center_reference, jrv_number,
    fiscal_person_id, fiscal_name, responsible_name,
    is_center_responsible, active, created_by
  ) values (
    assignment_record_id, new.campaign_id, municipality, target_campaign.is_demo,
    center_id, center_name, center_reference, jrv_number,
    fiscal_id, fiscal_name, responsible_name,
    coalesce(nullif(assignment_payload->>'center_responsible_id', '') = fiscal_id::text, false),
    true, coalesce(new.created_by::text, 'campaign-record-bridge')
  )
  on conflict (campaign_id, source_assignment_id) do update set
    municipality_code = excluded.municipality_code,
    is_demo = excluded.is_demo,
    center_id = excluded.center_id,
    center_name = excluded.center_name,
    center_reference = excluded.center_reference,
    jrv_number = excluded.jrv_number,
    fiscal_person_id = excluded.fiscal_person_id,
    fiscal_name = excluded.fiscal_name,
    responsible_name = excluded.responsible_name,
    is_center_responsible = excluded.is_center_responsible,
    active = true
  returning id into v_assignment_id;

  code := upper(regexp_replace(coalesce(new.payload->>'code', ''), '[^A-Z0-9]', '', 'g'));
  if length(code) < 8 or length(code) > 16 then
    raise exception 'El código de acceso no es válido';
  end if;
  v_code_hash := encode(extensions.digest(code, 'sha256'), 'hex');
  v_link_hash := encode(extensions.digest('campaign-record:' || new.id::text, 'sha256'), 'hex');

  begin
    v_expires_at := (new.payload->>'expires_at')::timestamptz;
  exception when others then
    v_expires_at := now() + interval '72 hours';
  end;
  if v_expires_at <= now() or v_expires_at > now() + interval '30 days' then
    raise exception 'Vencimiento fuera del rango permitido';
  end if;

  v_grant_status := case upper(coalesce(new.status, ''))
    when 'ACTIVO' then 'ACTIVE'
    when 'SUSPENDIDO' then 'SUSPENDED'
    when 'REVOCADO' then 'REVOKED'
    else 'REVOKED'
  end;

  update public.day_d_fiscal_access_grants
  set status = 'REVOKED', revoked_at = coalesce(revoked_at, now())
  where day_d_fiscal_access_grants.assignment_id = v_assignment_id
    and day_d_fiscal_access_grants.status = 'ACTIVE'
    and day_d_fiscal_access_grants.link_hash <> v_link_hash;

  insert into public.day_d_fiscal_access_grants(
    assignment_id, campaign_id, municipality_code, center_id, jrv_number,
    fiscal_person_id, link_hash, code_hash, status, demo_mode, test_mode,
    expires_at, revoked_at, created_by
  ) values (
    v_assignment_id, new.campaign_id, municipality, center_id, jrv_number,
    fiscal_id, v_link_hash, v_code_hash, v_grant_status, target_campaign.is_demo,
    not target_campaign.is_demo, v_expires_at,
    case when v_grant_status = 'ACTIVE' then null else now() end,
    new.created_by
  )
  on conflict (link_hash) do update set
    assignment_id = excluded.assignment_id,
    campaign_id = excluded.campaign_id,
    municipality_code = excluded.municipality_code,
    center_id = excluded.center_id,
    jrv_number = excluded.jrv_number,
    fiscal_person_id = excluded.fiscal_person_id,
    code_hash = excluded.code_hash,
    status = excluded.status,
    demo_mode = excluded.demo_mode,
    test_mode = excluded.test_mode,
    expires_at = excluded.expires_at,
    revoked_at = excluded.revoked_at,
    updated_at = now()
  returning id into v_grant_id;

  insert into public.day_d_fiscal_audit_log(
    campaign_id, municipality_code, fiscal_person_id, access_grant_id,
    action, subject_type, subject_id, metadata
  ) values (
    new.campaign_id, municipality, fiscal_id, v_grant_id,
    case when v_grant_status = 'ACTIVE' then 'ACCESS_BRIDGED' else 'ACCESS_STATUS_SYNCED' end,
    'CAMPAIGN_RECORD', new.id::text,
    jsonb_build_object(
      'source_schema', tg_table_schema,
      'is_demo', target_campaign.is_demo,
      'test_mode', not target_campaign.is_demo,
      'expires_at', v_expires_at
    )
  );

  return new;
end;
$function$
;
