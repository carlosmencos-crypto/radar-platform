-- QA-only client visibility test for municipal, department and national Pulso.

do $$
declare
  super_id constant uuid := '10000000-0000-4000-8000-000000000001';
  client_org_id constant uuid := '20000000-0000-4000-8000-000000000001';
  client_0509 constant uuid := '30000000-0000-4000-8000-000000000001';
  client_1901 constant uuid := '30000000-0000-4000-8000-000000000002';
  campaign_0509 uuid;
  campaign_1901 uuid;
  result jsonb;
  denied boolean;
begin
  result := public.radar_admin_create_campaign_v1(super_id,'super_admin','0509',client_org_id,
    'Campaña QA 0509','qa-0509','active','Vertical cliente 0509');
  campaign_0509 := (result->>'id')::uuid;
  result := public.radar_admin_create_campaign_v1(super_id,'super_admin','1901',client_org_id,
    'Campaña QA 1901','qa-1901','active','Vertical cliente 1901');
  campaign_1901 := (result->>'id')::uuid;

  insert into auth.users(id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
  values
    (client_0509,'authenticated','authenticated','client-0509@qa.invalid','{"provider":"email","providers":["email"]}','{}',now(),now()),
    (client_1901,'authenticated','authenticated','client-1901@qa.invalid','{"provider":"email","providers":["email"]}','{}',now(),now());
  insert into public.profiles(user_id,display_name,platform_role,organization_id,is_active) values
    (client_0509,'Cliente QA 0509','user',client_org_id,true),
    (client_1901,'Cliente QA 1901','user',client_org_id,true)
  on conflict(user_id) do update set
    display_name=excluded.display_name,platform_role='user',organization_id=excluded.organization_id,is_active=true,updated_at=now();
  insert into public.campaign_members(campaign_id,user_id,member_role) values
    (campaign_0509,client_0509,'campaign_viewer'),
    (campaign_1901,client_1901,'campaign_viewer');

  perform set_config('request.jwt.claim.sub',client_0509::text,true);
  result := public.radar_authorized_pulse_v1('0509');
  if jsonb_array_length(result) <> 3 then
    raise exception '0509 must see municipal + department 05 + national Pulse';
  end if;
  if (select count(*) from jsonb_array_elements(result) x where x->>'scope_type'='MUNICIPALITY') <> 1
    or (select count(*) from jsonb_array_elements(result) x where x->>'scope_type'='DEPARTMENT') <> 1
    or (select count(*) from jsonb_array_elements(result) x where x->>'scope_type'='NATIONAL') <> 1 then
    raise exception '0509 Pulse scope composition mismatch';
  end if;
  denied := false;
  begin
    perform public.radar_authorized_pulse_v1('1901');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception '0509 client accessed 1901'; end if;

  perform set_config('request.jwt.claim.sub',client_1901::text,true);
  result := public.radar_authorized_pulse_v1('1901');
  if jsonb_array_length(result) <> 1 or result->0->>'scope_type' <> 'NATIONAL' then
    raise exception '1901 must see only the authorized national Pulse fixture';
  end if;
  denied := false;
  begin
    perform public.radar_authorized_pulse_v1('0509');
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception '1901 client accessed 0509'; end if;
end
$$;

select jsonb_build_object(
  'status','PASS',
  'client_0509_visible_scopes',array['MUNICIPALITY','DEPARTMENT','NATIONAL'],
  'client_1901_visible_scopes',array['NATIONAL'],
  'cross_municipality_access','DENIED'
) as pulse_authorization_qa;
