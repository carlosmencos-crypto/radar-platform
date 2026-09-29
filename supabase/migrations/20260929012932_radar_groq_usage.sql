-- Service-only metadata. Prompts, responses and API keys are never stored here.
create table public.radar_ai_requests (
 id uuid primary key default gen_random_uuid(),
 created_at timestamptz not null default now(),
 finished_at timestamptz,
 user_id uuid not null,
 campaign_id uuid not null,
 status text not null default 'pending' check(status in ('pending','completed','failed','uncertain')),
 reserved_tokens integer not null check(reserved_tokens between 1 and 10000),
 input_tokens integer not null default 0 check(input_tokens>=0),
 output_tokens integer not null default 0 check(output_tokens>=0),
 provider_limits jsonb not null default '{}'
);
create index radar_ai_requests_time on public.radar_ai_requests(created_at);
alter table public.radar_ai_requests enable row level security;
revoke all on public.radar_ai_requests from public,anon,authenticated;
grant select,insert,update on public.radar_ai_requests to service_role;

create function public.radar_ai_reserve_v1(p_user uuid,p_campaign uuid,p_tokens integer) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r uuid; start_day timestamptz:=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC'; total bigint; calls bigint;
begin
 if current_user <> 'service_role' then raise exception 'SERVICE_ONLY'; end if;
 if p_tokens < 1 or p_tokens > 10000 then return jsonb_build_object('allowed',false); end if;
 perform pg_advisory_xact_lock(71290321);
 select count(*),coalesce(sum(case when status in ('pending','uncertain') then reserved_tokens else input_tokens+output_tokens end),0)
 into calls,total from public.radar_ai_requests where created_at>=start_day;
 if calls>=1000 or total+p_tokens>200000
 or (select count(*) from public.radar_ai_requests where campaign_id=p_campaign and created_at>=start_day)>=30
 or (select count(*) from public.radar_ai_requests where user_id=p_user and created_at>now()-interval '1 hour')>=15
 or (select coalesce(sum(reserved_tokens),0) from public.radar_ai_requests where created_at>now()-interval '1 minute')+p_tokens>8000
 then return jsonb_build_object('allowed',false); end if;
 insert into public.radar_ai_requests(user_id,campaign_id,reserved_tokens) values(p_user,p_campaign,p_tokens) returning id into r;
 return jsonb_build_object('allowed',true,'id',r);
end;$$;
create function public.radar_ai_finish_v1(p_id uuid,p_status text,p_input integer,p_output integer,p_provider jsonb) returns void
language plpgsql security invoker set search_path='' as $$
begin
 if current_user <> 'service_role' then raise exception 'SERVICE_ONLY'; end if;
 if p_status not in ('completed','failed','uncertain') or p_input<0 or p_output<0 then raise exception 'INVALID_USAGE'; end if;
 update public.radar_ai_requests set status=p_status,input_tokens=p_input,output_tokens=p_output,provider_limits=p_provider,finished_at=now() where id=p_id and status='pending';
end;$$;
create function public.radar_ai_usage_v1() returns jsonb
language sql security invoker set search_path='' as $$
 select jsonb_build_object(
 'day_utc',to_char(now() at time zone 'UTC','YYYY-MM-DD'),
 'daily_token_limit',200000,'daily_request_limit',1000,'campaign_daily_limit',30,
 'requests',count(*),'completed',count(*) filter(where status='completed'),
 'tokens',coalesce(sum(input_tokens+output_tokens),0),
 'reserved',coalesce(sum(reserved_tokens) filter(where status in ('pending','uncertain')),0),
 'input_tokens',coalesce(sum(input_tokens),0),'output_tokens',coalesce(sum(output_tokens),0),
 'provider',(select jsonb_build_object('observed_at',finished_at,'limits',provider_limits) from public.radar_ai_requests where provider_limits<>'{}'::jsonb order by created_at desc limit 1)
 ) from public.radar_ai_requests where created_at>=date_trunc('day',now() at time zone 'UTC') at time zone 'UTC';
$$;
revoke all on function public.radar_ai_reserve_v1(uuid,uuid,integer),public.radar_ai_finish_v1(uuid,text,integer,integer,jsonb),public.radar_ai_usage_v1() from public,anon,authenticated;
grant execute on function public.radar_ai_reserve_v1(uuid,uuid,integer),public.radar_ai_finish_v1(uuid,text,integer,integer,jsonb),public.radar_ai_usage_v1() to service_role;
