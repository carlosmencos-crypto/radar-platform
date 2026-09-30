-- Reconcile any fiscal records that predate the dashboard bridge or survived
-- an older demo reset. Each publisher chooses campaign_vault or demo_vault
-- from the canonical is_demo flag and is idempotent by source identifier.

do $$
declare
  assignment_id uuid;
  incident_id uuid;
  folio_id uuid;
begin
  for assignment_id in
    select id from public.day_d_jrv_assignments
  loop
    perform admin_vault.publish_day_d_assignment_status(assignment_id);
  end loop;

  for incident_id in
    select id from public.day_d_incidents
  loop
    perform admin_vault.publish_day_d_incident(incident_id);
  end loop;

  for folio_id in
    select id from public.day_d_rtd_folios
  loop
    perform admin_vault.publish_day_d_rtd_folio(folio_id);
  end loop;
end
$$;
