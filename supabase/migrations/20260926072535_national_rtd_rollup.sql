-- Explicit election context; old records without it are not mixed into a new election.
alter table campaign_vault.rtd_results add column if not exists election_cycle integer;
alter table campaign_vault.rtd_results add column if not exists election_round smallint;
alter table campaign_vault.rtd_results add column if not exists electoral_district_code text;

create or replace function public.radar_admin_national_rtd_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,campaign_vault,pg_temp as $$
declare payload jsonb; election text:=p_input->>'election_type'; cycle integer:=(p_input->>'election_cycle')::integer; round_no integer:=(p_input->>'election_round')::integer;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Consolidado nacional exclusivo de superadministración' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado' using errcode='42501'; end if;
 if election is null or election not in ('ALCALDIA','DIP_DIST','DIP_NAC','PRESIDENTE') or cycle is null or cycle not between 2023 and 2100 or round_no is null or round_no not in (1,2) or (election<>'PRESIDENTE' and round_no<>1) then raise exception 'Elección, año o vuelta no válidos'; end if;
 with campaigns_in_scope as (
  select c.id,m.municipality_code,m.municipality_name,m.department_code
  from public.campaigns c join public.municipalities m on m.id=c.municipality_id
  where not c.is_demo and c.status='active' and not m.is_synthetic
   and (nullif(p_input->>'municipality_code','') is null or m.municipality_code=p_input->>'municipality_code')
   and (nullif(p_input->>'department_code','') is null or m.department_code=p_input->>'department_code')
 ), reports as (
  select r.*,c.municipality_code,c.municipality_name,c.department_code,
   case when jsonb_typeof(r.results)='array' then r.results else '[]'::jsonb end entries
  from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id
  where r.election_type=election and r.election_cycle=cycle and r.election_round=round_no
 ), checked as (
  select r.*,v.valid_votes,v.options,
   (r.status in ('confirmed','validated') and nullif(trim(r.voting_center_code),'') is not null and nullif(trim(r.jrv_code),'') is not null
    and (election<>'DIP_DIST' or nullif(trim(r.electoral_district_code),'') is not null)
    and jsonb_typeof(r.results)='array' and coalesce(v.rows_valid,true)
    and v.option_count=v.distinct_options and r.blank_votes>=0 and r.null_votes>=0
    and r.total_ballots>=v.valid_votes+r.blank_votes+r.null_votes) eligible,
   case when election='ALCALDIA' then r.municipality_code when election='DIP_DIST' then r.electoral_district_code else 'GT' end territory
  from reports r cross join lateral (
   select coalesce(sum(case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end),0) valid_votes,
    bool_and(jsonb_typeof(e)='object' and nullif(trim(e->>'party_id'),'') is not null and coalesce(e->>'votes','') ~ '^[0-9]{1,9}$') rows_valid,
    count(*) option_count,count(distinct e->>'party_id') distinct_options,
    coalesce(jsonb_agg(jsonb_build_object('party_id',e->>'party_id','votes',case when e->>'votes' ~ '^[0-9]{1,9}$' then (e->>'votes')::bigint else 0 end) order by e->>'party_id'),'[]') options
   from jsonb_array_elements(r.entries) e
  ) v
 ), signatures as (
  select *,jsonb_build_object('options',options,'blank',blank_votes,'null',null_votes,'ballots',total_ballots,'district',electoral_district_code)::text signature
  from checked where eligible
 ), acta_groups as (
  select municipality_code,voting_center_code,jrv_code,count(*) reports,count(distinct signature) versions
  from signatures group by municipality_code,voting_center_code,jrv_code
 ), accepted as (
  select distinct on (s.municipality_code,s.voting_center_code,s.jrv_code) s.*
  from signatures s join acta_groups g using(municipality_code,voting_center_code,jrv_code)
  where g.versions=1
  order by s.municipality_code,s.voting_center_code,s.jrv_code,s.submitted_at desc nulls last,s.created_at desc,s.id
 ), totals as (
  select a.territory,e->>'party_id' party_id,min(coalesce(nullif(e->>'party_name',''),e->>'party_id')) party_name,
   case when count(distinct nullif(e->>'candidate_name',''))=1 then min(nullif(e->>'candidate_name','')) else null end candidate_name,
   sum((e->>'votes')::bigint) votes
  from accepted a cross join lateral jsonb_array_elements(a.entries) e group by a.territory,e->>'party_id'
 ), municipalities as (
  select c.municipality_code,c.municipality_name,c.department_code,
   (select count(*) from campaign_vault.fiscales f join campaigns_in_scope s on s.id=f.campaign_id where s.municipality_code=c.municipality_code) fiscales,
   (select count(*) from reports r where r.municipality_code=c.municipality_code) received,
   (select count(*) from accepted a where a.municipality_code=c.municipality_code) counted,
   (select coalesce(sum(valid_votes),0) from accepted a where a.municipality_code=c.municipality_code) valid_votes
  from campaigns_in_scope c group by c.municipality_code,c.municipality_name,c.department_code
 )
 select jsonb_build_object(
  'generated_at',now(),'election_type',election,'election_cycle',cycle,'election_round',round_no,'environment','QA',
  'summary',jsonb_build_object(
   'fiscales',(select count(*) from campaign_vault.fiscales f join campaigns_in_scope c on c.id=f.campaign_id),
   'municipalities',(select count(distinct municipality_code) from campaigns_in_scope),
   'reporting_municipalities',(select count(distinct municipality_code) from accepted),
   'received',(select count(*) from reports),'counted',(select count(*) from accepted),
   'pending',(select count(*) from checked where not coalesce(eligible,false)),
   'conflicts',(select count(*) from acta_groups where versions>1),
   'duplicates',(select coalesce(sum(reports-1),0) from acta_groups where versions=1),
   'missing_context',(select count(*) from campaign_vault.rtd_results r join campaigns_in_scope c on c.id=r.campaign_id where r.election_type=election and (r.election_cycle is null or r.election_round is null)),
   'valid_votes',(select coalesce(sum(valid_votes),0) from accepted),
   'blank_votes',(select coalesce(sum(blank_votes),0) from accepted),'null_votes',(select coalesce(sum(null_votes),0) from accepted),
   'last_report',(select max(coalesce(submitted_at,created_at)) from reports)),
  'results',(select coalesce(jsonb_agg(to_jsonb(t) order by territory,votes desc,party_id),'[]') from totals t),
  'territories',(select coalesce(jsonb_agg(to_jsonb(t) order by territory),'[]') from (select territory,count(*) actas,sum(valid_votes) valid_votes,sum(blank_votes) blank_votes,sum(null_votes) null_votes from accepted group by territory)t),
  'municipalities',(select coalesce(jsonb_agg(to_jsonb(m) order by municipality_code),'[]') from municipalities m)
 ) into payload;
 return payload;
end $$;
revoke all on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_national_rtd_v1(uuid,text,jsonb) to service_role;
