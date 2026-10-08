-- Disabled, demo-only pilot. No existing RTD tables or totals are modified.
create table public.radar_ocr_budget (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  demo_only boolean not null default true,
  page_limit integer not null default 100 check (page_limit between 0 and 1000000),
  reserved_pages integer not null default 0 check (reserved_pages >= 0)
);
insert into public.radar_ocr_budget(id) values(true);
create table public.radar_ocr_jobs (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  assignment_id uuid not null references public.day_d_jrv_assignments(id) on delete cascade,
  is_demo boolean not null,
  is_test boolean not null,
  election_type text not null check (election_type in ('PRESIDENTE','CORPORACION_MUNICIPAL','DIP_DIST','DIP_NAC','DIP_PAR')),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'PENDING' check (status in ('PENDING','COMPLETE','FAILED')),
  result jsonb,
  created_at timestamptz not null default now(),
  unique (campaign_id, assignment_id, is_demo, is_test, election_type, request_hash)
);
create index radar_ocr_jobs_assignment_time on public.radar_ocr_jobs(assignment_id,created_at);
alter table public.radar_ocr_budget enable row level security;
alter table public.radar_ocr_jobs enable row level security;
revoke all on public.radar_ocr_budget, public.radar_ocr_jobs from public, anon, authenticated;
grant select,insert,update,delete on public.radar_ocr_budget, public.radar_ocr_jobs to service_role;
-- Invoker RPC: only the authenticated backend has access. Atomic budget reservation.
create function public.radar_ocr_reserve_v1(p_campaign uuid,p_assignment uuid,p_demo boolean,p_test boolean,p_election text,p_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare b public.radar_ocr_budget%rowtype; j public.radar_ocr_jobs%rowtype;
begin
  select * into b from public.radar_ocr_budget where id=true for update;
  if not found or not b.enabled then return jsonb_build_object('state','DISABLED'); end if;
  if b.demo_only and not p_demo then return jsonb_build_object('state','DEMO_ONLY'); end if;
  if not exists(select 1 from public.day_d_jrv_assignments a join public.campaigns c on c.id=a.campaign_id
    where a.id=p_assignment and c.id=p_campaign and a.active and c.status='active'
      and a.is_demo=p_demo and c.is_demo=p_demo) then
    raise exception 'OCR_SCOPE_INVALID';
  end if;
  select * into j from public.radar_ocr_jobs where campaign_id=p_campaign and assignment_id=p_assignment
    and is_demo=p_demo and is_test=p_test and election_type=p_election and request_hash=p_hash;
  if found then return jsonb_build_object('state',j.status,'id',j.id,'result',j.result); end if;
  if b.reserved_pages>=b.page_limit then return jsonb_build_object('state','LIMIT'); end if;
  if (select count(*) from public.radar_ocr_jobs where assignment_id=p_assignment and created_at>now()-interval '24 hours')>=10 then
    return jsonb_build_object('state','RATE_LIMIT');
  end if;
  insert into public.radar_ocr_jobs(campaign_id,assignment_id,is_demo,is_test,election_type,request_hash)
    values(p_campaign,p_assignment,p_demo,p_test,p_election,p_hash) returning * into j;
  update public.radar_ocr_budget set reserved_pages=reserved_pages+1 where id=true;
  return jsonb_build_object('state','RESERVED','id',j.id);
end; $$;
revoke all on function public.radar_ocr_reserve_v1(uuid,uuid,boolean,boolean,text,text) from public,anon,authenticated;
grant execute on function public.radar_ocr_reserve_v1(uuid,uuid,boolean,boolean,text,text) to service_role;
comment on table public.radar_ocr_budget is 'Lifetime pilot cap, not billing balance. Reservations including uncertain failures remain counted. Raise explicitly after testing; no automatic reset.';
