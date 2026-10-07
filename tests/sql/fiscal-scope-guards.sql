-- Negative scope tests must run inside BEGIN / ROLLBACK. No persisted fixtures.
do $scope$
declare
  folio public.day_d_rtd_folios%rowtype;
  grant_id uuid;
  session_id uuid;
  evidence_id uuid;
  blocked boolean;
begin
  select * into strict folio from public.day_d_rtd_folios where is_demo and status='ENVIADO' order by updated_at desc limit 1;
  select id into strict grant_id from public.day_d_fiscal_access_grants where assignment_id=folio.assignment_id limit 1;
  select id into strict session_id from public.day_d_fiscal_sessions where assignment_id=folio.assignment_id limit 1;
  select id into strict evidence_id from public.day_d_evidence where subject_id=folio.id and subject_type='RTD' limit 1;
  blocked:=false;
  begin
    update public.day_d_rtd_folios set is_demo=not is_demo where id=folio.id;
  exception when check_violation then
    if sqlerrm<>'DAY_D_SUBMISSION_SCOPE_MISMATCH' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Real/demo crossing was allowed'; end if;
  blocked:=false;
  begin
    update public.day_d_fiscal_access_grants set municipality_code='9999' where id=grant_id;
  exception when check_violation then
    if sqlerrm<>'DAY_D_GRANT_SCOPE_MISMATCH' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Foreign grant scope was allowed'; end if;
  blocked:=false;
  begin
    update public.day_d_fiscal_sessions set jrv_number=jrv_number+10000 where id=session_id;
  exception when check_violation then
    if sqlerrm<>'DAY_D_SESSION_SCOPE_MISMATCH' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Foreign session JRV was allowed'; end if;
  blocked:=false;
  begin
    update public.day_d_evidence set object_path='9999/foreign/acta.jpg' where id=evidence_id;
  exception when check_violation then
    if sqlerrm<>'DAY_D_EVIDENCE_PATH_MISMATCH' then raise; end if;
    blocked:=true;
  end;
  if not blocked then raise exception 'Foreign evidence path was allowed'; end if;
end;
$scope$;
