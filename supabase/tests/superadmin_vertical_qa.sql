-- Destructive QA fixture for an isolated Supabase branch only.
-- Never execute against production. It contains no real people or campaign data.

do $$
declare
  super_id constant uuid := '10000000-0000-4000-8000-000000000001';
  data_muni_id constant uuid := '10000000-0000-4000-8000-000000000002';
  data_dept_id constant uuid := '10000000-0000-4000-8000-000000000003';
  data_nat_id constant uuid := '10000000-0000-4000-8000-000000000004';
  qa_id constant uuid := '10000000-0000-4000-8000-000000000005';
  support_id constant uuid := '10000000-0000-4000-8000-000000000006';
  commercial_id constant uuid := '10000000-0000-4000-8000-000000000007';
  client_org_id constant uuid := '20000000-0000-4000-8000-000000000001';
  result jsonb;
  batch_one uuid;
  batch_two uuid;
  release_one uuid;
  release_two uuid;
  pulse_id uuid;
  support_session_id uuid;
  denied boolean;
  rls_count integer;
begin
  if (select count(*) from public.municipalities where not is_synthetic) <> 340 then
    raise exception 'QA expected 340 canonical municipalities';
  end if;
  if (select count(distinct department_code) from public.municipalities where not is_synthetic) <> 22 then
    raise exception 'QA expected 22 departments';
  end if;
  if (select count(*) from admin_vault.canonical_layers) <> 17 then
    raise exception 'QA expected 17 canonical layers';
  end if;

  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (super_id,'authenticated','authenticated','superadmin@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"super_admin"}','{}',now(),now()),
    (data_muni_id,'authenticated','authenticated','data-0509@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"data_ops"}','{}',now(),now()),
    (data_dept_id,'authenticated','authenticated','data-05@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"data_ops"}','{}',now(),now()),
    (data_nat_id,'authenticated','authenticated','data-gt@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"data_ops"}','{}',now(),now()),
    (qa_id,'authenticated','authenticated','qa-gt@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"qa"}','{}',now(),now()),
    (support_id,'authenticated','authenticated','support-0509@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"support"}','{}',now(),now()),
    (commercial_id,'authenticated','authenticated','commercial-0509@qa.invalid','{"provider":"email","providers":["email"],"platform_role":"commercial_ops"}','{}',now(),now());

  insert into public.profiles(user_id,display_name,platform_role,is_active) values
    (super_id,'QA Super Admin','super_admin',true),
    (data_muni_id,'QA Data 0509','data_ops',true),
    (data_dept_id,'QA Data 05','data_ops',true),
    (data_nat_id,'QA Data GT','data_ops',true),
    (qa_id,'QA Approver GT','qa',true),
    (support_id,'QA Support 0509','support',true),
    (commercial_id,'QA Commercial 0509','commercial_ops',true)
  on conflict(user_id) do update set
    display_name=excluded.display_name,
    platform_role=excluded.platform_role,
    is_active=true,
    updated_at=now();

  insert into public.organizations(id,name,slug,country_code,is_platform_owner)
  values(client_org_id,'Cliente QA RADAR','cliente-qa-radar','GT',false);

  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',data_muni_id,'data_ops',
    '{"country_code":"GT","department_code":"05","municipality_code":"0509"}',array['data:preview','pulse:draft'],'Fixture QA 0509');
  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',data_dept_id,'data_ops',
    '{"country_code":"GT","department_code":"05"}',array['pulse:draft'],'Fixture QA departamento 05');
  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',data_nat_id,'data_ops',
    '{"country_code":"GT"}',array['pulse:draft'],'Fixture QA nacional');
  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',qa_id,'qa',
    '{"country_code":"GT"}',array['data:approve','data:publish','data:rollback','pulse:approve'],'Fixture QA aprobación');
  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',support_id,'support',
    '{"country_code":"GT","department_code":"05","municipality_code":"0509"}',array['support:open','support:close'],'Fixture QA soporte');
  perform public.radar_admin_assign_operator_scope_v1(super_id,'super_admin',commercial_id,'commercial_ops',
    '{"country_code":"GT","department_code":"05","municipality_code":"0509"}',array['contracts:write','campaigns:write'],'Fixture QA comercial');

  result := public.radar_admin_operator_context_v1(data_muni_id,'data_ops');
  if result->>'user_role' <> 'data_ops' or jsonb_array_length(result->'scopes') <> 1 then
    raise exception 'operator context contract failed';
  end if;

  perform public.radar_admin_reserve_contract_v1(commercial_id,'commercial_ops','0509',client_org_id,null,
    'QA-0509-A',current_date,current_date+365,'ACTIVE','Prueba de exclusividad 0509');
  denied := false;
  begin
    perform public.radar_admin_reserve_contract_v1(super_id,'super_admin','0509',client_org_id,null,
      'QA-0509-CONFLICT',current_date+30,current_date+395,'ACTIVE','Conflicto esperado');
  exception when exclusion_violation then denied := true;
  end;
  if not denied then raise exception 'overlapping municipality contract was accepted'; end if;

  denied := false;
  begin
    perform public.radar_admin_reserve_contract_v1(commercial_id,'commercial_ops','1901',client_org_id,null,
      'QA-1901-DENIED',current_date,current_date+365,'ACTIVE','Cruce territorial esperado');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'commercial cross-municipality write was accepted'; end if;
  perform public.radar_admin_reserve_contract_v1(super_id,'super_admin','1901',client_org_id,null,
    'QA-1901-A',current_date,current_date+365,'ACTIVE','Municipio de control QA');

  perform public.radar_admin_register_source_v1(super_id,'super_admin',
    '{"source_id":"QA_ROUTE_SOURCE","layer_id":"ROUTES_340","source_label":"Fixture QA","territorial_scale":"MUNICIPALITY","source_period":"2026-09-18","validation_status":"VALIDATED","lineage":{"fixture":true}}',
    'Registrar fuente QA');

  denied := false;
  begin
    perform public.radar_admin_create_publication_preview_v1(data_muni_id,'data_ops',jsonb_build_object(
      'dataset_key','QA_CROSS_SCOPE','layer_id','ROUTES_340','scope_type','MUNICIPALITY','country_code','GT',
      'department_code','19','municipality_code','1901','source_id','QA_ROUTE_SOURCE','source_label','Fixture QA',
      'storage_path','municipality/1901/qa/denied.csv','file_sha256',repeat('d',64),'row_count',1,
      'preview_hash',repeat('e',64),'release_manifest',jsonb_build_object('fixture',true)
    ),'[]','Cruce territorial esperado');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'data cross-municipality preview was accepted'; end if;

  result := public.radar_admin_create_publication_preview_v1(data_muni_id,'data_ops',jsonb_build_object(
    'dataset_key','QA_0509_DATASET','layer_id','ROUTES_340','scope_type','MUNICIPALITY','country_code','GT',
    'department_code','05','municipality_code','0509','source_id','QA_ROUTE_SOURCE','source_label','Fixture QA','source_period','2026-09-18',
    'storage_path','municipality/0509/qa/v1.csv','file_sha256',repeat('a',64),'row_count',10,
    'preview_hash',repeat('1',64),'release_manifest',jsonb_build_object('fixture',true,'version',1)
  ),'[]','Preview versión uno');
  batch_one := (result->'batch'->>'id')::uuid;
  perform public.radar_admin_transition_publication_v1(qa_id,'qa',batch_one,'APPROVED','Aprobar versión uno');
  result := public.radar_admin_transition_publication_v1(qa_id,'qa',batch_one,'PUBLISHED','Publicar versión uno');
  release_one := (result->'release'->>'id')::uuid;

  result := public.radar_admin_create_publication_preview_v1(data_muni_id,'data_ops',jsonb_build_object(
    'dataset_key','QA_0509_DATASET','layer_id','ROUTES_340','scope_type','MUNICIPALITY','country_code','GT',
    'department_code','05','municipality_code','0509','source_id','QA_ROUTE_SOURCE','source_label','Fixture QA','source_period','2026-09-18',
    'storage_path','municipality/0509/qa/v2.csv','file_sha256',repeat('b',64),'row_count',11,
    'preview_hash',repeat('2',64),'release_manifest',jsonb_build_object('fixture',true,'version',2)
  ),'[]','Preview versión dos');
  batch_two := (result->'batch'->>'id')::uuid;
  perform public.radar_admin_transition_publication_v1(qa_id,'qa',batch_two,'APPROVED','Aprobar versión dos');
  result := public.radar_admin_transition_publication_v1(qa_id,'qa',batch_two,'PUBLISHED','Publicar versión dos');
  release_two := (result->'release'->>'id')::uuid;
  result := public.radar_admin_rollback_release_v1(qa_id,'qa',release_two,release_one,'Rollback QA a versión uno');
  if (result->>'version_number')::integer <> 3 or not (result->>'is_current')::boolean then
    raise exception 'publication rollback failed';
  end if;

  result := public.radar_admin_save_pulse_v2(data_muni_id,'data_ops',
    '{"folio":"QA-PULSO-MUN-0509","election_type":"ALCALDIA","municipality_code":"0509","field_start":"2026-09-01","field_end":"2026-09-10","sample_size":"400","scope_label":"San José","methodology":"Fixture QA","technical_sheet":{"confidence":95},"source_id":"QA_ROUTE_SOURCE","source_label":"Fixture QA","version":"1"}',
    '[{"option_code":"A","candidate_name":"Opción A","organization":"QA","value":"55","display_order":"1"},{"option_code":"B","candidate_name":"Opción B","organization":"QA","value":"45","display_order":"2"}]',null,'Crear Pulso municipal QA');
  pulse_id := (result->>'id')::uuid;
  perform public.radar_admin_transition_pulse_v1(data_muni_id,'data_ops',pulse_id,'PREVALIDADA',repeat('3',64),'Prevalidar Pulso municipal');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'APROBADA',null,'Aprobar Pulso municipal');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'PUBLICADA',null,'Publicar Pulso municipal');

  result := public.radar_admin_save_pulse_v2(data_dept_id,'data_ops',
    '{"folio":"QA-PULSO-DEP-05","election_type":"DIP_DIST","country_code":"GT","department_code":"05","field_start":"2026-09-01","field_end":"2026-09-10","sample_size":"600","scope_label":"Escuintla","methodology":"Fixture QA","technical_sheet":{"confidence":95},"source_id":"QA_ROUTE_SOURCE","source_label":"Fixture QA","version":"1"}',
    '[{"option_code":"A","candidate_name":"Opción A","organization":"QA","value":"52","display_order":"1"},{"option_code":"B","candidate_name":"Opción B","organization":"QA","value":"48","display_order":"2"}]',null,'Crear Pulso departamental QA');
  pulse_id := (result->>'id')::uuid;
  perform public.radar_admin_transition_pulse_v1(data_dept_id,'data_ops',pulse_id,'PREVALIDADA',repeat('4',64),'Prevalidar Pulso departamental');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'APROBADA',null,'Aprobar Pulso departamental');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'PUBLICADA',null,'Publicar Pulso departamental');

  result := public.radar_admin_save_pulse_v2(data_nat_id,'data_ops',
    '{"folio":"QA-PULSO-NAT-GT","election_type":"PRESIDENTE","country_code":"GT","field_start":"2026-09-01","field_end":"2026-09-10","sample_size":"1200","scope_label":"Guatemala","methodology":"Fixture QA","technical_sheet":{"confidence":95},"source_id":"QA_ROUTE_SOURCE","source_label":"Fixture QA","version":"1"}',
    '[{"option_code":"A","candidate_name":"Opción A","organization":"QA","value":"51","display_order":"1"},{"option_code":"B","candidate_name":"Opción B","organization":"QA","value":"49","display_order":"2"}]',null,'Crear Pulso nacional QA');
  pulse_id := (result->>'id')::uuid;
  perform public.radar_admin_transition_pulse_v1(data_nat_id,'data_ops',pulse_id,'PREVALIDADA',repeat('5',64),'Prevalidar Pulso nacional');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'APROBADA',null,'Aprobar Pulso nacional');
  perform public.radar_admin_transition_pulse_v1(qa_id,'qa',pulse_id,'PUBLICADA',null,'Publicar Pulso nacional');

  denied := false;
  begin
    perform public.radar_admin_save_pulse_v2(data_muni_id,'data_ops',
      '{"folio":"QA-PULSO-DENIED-1901","election_type":"ALCALDIA","municipality_code":"1901","field_start":"2026-09-01","field_end":"2026-09-10","sample_size":"100","scope_label":"Zacapa","methodology":"Fixture QA","technical_sheet":{"confidence":95},"source_id":"QA_ROUTE_SOURCE","source_label":"Fixture QA","version":"1"}',
      '[{"option_code":"A","candidate_name":"Opción A","organization":"QA","value":"50","display_order":"1"},{"option_code":"B","candidate_name":"Opción B","organization":"QA","value":"50","display_order":"2"}]',null,'Cruce Pulso esperado');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'municipal Pulse cross-scope write was accepted'; end if;

  result := public.radar_admin_open_support_session_v1(support_id,'support','QA-TICKET-0509','0509',null,'READ_ONLY','Diagnóstico QA',now()+interval '30 minutes');
  support_session_id := (result->>'id')::uuid;
  perform public.radar_admin_close_support_session_v1(support_id,'support',support_session_id,'Cerrar diagnóstico QA');
  denied := false;
  begin
    perform public.radar_admin_open_support_session_v1(support_id,'support','QA-TICKET-1901','1901',null,'READ_ONLY','Cruce soporte esperado',now()+interval '30 minutes');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'support cross-municipality session was accepted'; end if;

  perform public.radar_admin_revoke_user_sessions_v1(super_id,'super_admin',commercial_id,'Revocar sesiones QA');
  perform public.radar_admin_set_profile_state_v1(super_id,'super_admin',commercial_id,false,'Suspender operador QA');
  if exists(select 1 from public.profiles where user_id=commercial_id and is_active) then
    raise exception 'profile suspension failed';
  end if;
  if exists(select 1 from admin_vault.operator_scopes where user_id=commercial_id and is_active) then
    raise exception 'scope revocation on suspension failed';
  end if;

  if has_schema_privilege('authenticated','admin_vault','USAGE') then
    raise exception 'authenticated unexpectedly has admin_vault usage';
  end if;
  if has_function_privilege('authenticated','public.radar_admin_snapshot_v1(uuid,text,text)','EXECUTE') then
    raise exception 'authenticated unexpectedly can execute admin snapshot';
  end if;
  select count(*) into rls_count from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='admin_vault' and c.relkind='r' and c.relrowsecurity;
  if rls_count <> 12 then raise exception 'not all 12 admin_vault tables have RLS'; end if;
  if not exists(select 1 from storage.buckets where id='radar-admin-staging' and not public) then
    raise exception 'private staging bucket missing';
  end if;
  if (select count(*) from data_vault.pulse_measurements where folio like 'QA-PULSO-%' and status='PUBLICADA') <> 3 then
    raise exception 'three-scope Pulse publication failed';
  end if;
  if (select count(*) from admin_vault.audit_events) < 25 then
    raise exception 'audit coverage unexpectedly low';
  end if;
end
$$;

select jsonb_build_object(
  'status','PASS',
  'municipalities',(select count(*) from public.municipalities where not is_synthetic),
  'departments',(select count(distinct department_code) from public.municipalities where not is_synthetic),
  'layers',(select count(*) from admin_vault.canonical_layers),
  'protected_contracts',(select count(*) from admin_vault.commercial_contracts where contract_ref like 'QA-%'),
  'publication_releases',(select count(*) from admin_vault.dataset_releases where dataset_key='QA_0509_DATASET'),
  'published_pulse_scopes',(select count(*) from data_vault.pulse_measurements where folio like 'QA-PULSO-%' and status='PUBLICADA'),
  'audit_events',(select count(*) from admin_vault.audit_events),
  'cross_scope_tests','DENIED',
  'rls_tables',(select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='admin_vault' and c.relkind='r' and c.relrowsecurity)
) as superadmin_vertical_qa;
