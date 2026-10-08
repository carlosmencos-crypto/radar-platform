-- Read-only verification: validates live cuts without creating or changing folios.
begin;
do $$
declare actor uuid; mode text; election text; cut jsonb; expected_received bigint;
begin
  select u.id into strict actor
  from auth.users u join public.profiles p on p.user_id=u.id
  where u.raw_app_meta_data->>'platform_role'='super_admin' and p.is_active limit 1;
  foreach mode in array array['REAL','TEST','DEMO'] loop
    foreach election in array array['PRESIDENTE','CORPORACION_MUNICIPAL','DIP_DIST','DIP_NAC','DIP_PAR'] loop
      cut := public.radar_admin_national_rtd_v1(actor,'super_admin',jsonb_build_object(
        'data_mode',mode,'election_type',election,'election_cycle',2023,'election_round',1));
      select count(*) into expected_received
      from public.day_d_rtd_folios f
      join public.campaigns c on c.id=f.campaign_id
      join public.municipalities m on m.id=c.municipality_id
      where c.status='active' and c.is_demo=(mode='DEMO') and f.is_demo=(mode='DEMO')
        and f.is_test=(mode='TEST') and f.election_type=election
        and (mode='DEMO' or (not m.is_synthetic and exists(
          select 1 from admin_vault.commercial_contracts cc
          where cc.campaign_id=c.id and cc.status='ACTIVE' and cc.contract_period @> current_date)))
        and substring(f.catalog_version from '(20[0-9]{2})')='2023'
        and not (upper(f.catalog_version) ~ '(VUELTA[_ -]?2|SEGUNDA|ROUND[_ -]?2)');
      if (cut#>>'{summary,received}')::bigint<>expected_received then
        raise exception 'Wrong scope for % / %',mode,election;
      end if;
      if (cut#>>'{summary,valid_votes}')::bigint<>(select coalesce(sum((item->>'valid_votes')::bigint),0) from jsonb_array_elements(cut->'municipalities') item)
        or (cut#>>'{summary,valid_votes}')::bigint<>(select coalesce(sum((item->>'votes')::bigint),0) from jsonb_array_elements(cut->'results') item) then
        raise exception 'Vote totals duplicated or lost for % / %',mode,election;
      end if;
    end loop;
  end loop;
  begin
    perform public.radar_admin_national_rtd_v1(actor,'qa','{}');
    raise exception 'Non-superadmin role accepted';
  exception when insufficient_privilege then null; end;
  if has_function_privilege('anon','public.radar_admin_national_rtd_v1(uuid,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.radar_admin_national_rtd_v1(uuid,text,jsonb)','EXECUTE') then
    raise exception 'Direct client execution permitted';
  end if;
end $$;
rollback;
select 'PASS: all five elections, three isolated environments, contract scope, equal totals and access controls' result;
