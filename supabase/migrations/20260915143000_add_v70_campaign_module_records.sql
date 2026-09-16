create table if not exists campaign_vault.campaign_records (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.campaigns(id) on delete cascade,
  module_key text not null,
  category text not null,
  title text not null,
  details text,
  status text not null default 'EN_PROCESO',
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists campaign_records_campaign_module_updated_idx
  on campaign_vault.campaign_records (campaign_id, module_key, updated_at desc, id);

alter table campaign_vault.campaign_records enable row level security;
revoke all on campaign_vault.campaign_records from public, anon;
grant select, insert, update, delete on campaign_vault.campaign_records to authenticated;

drop policy if exists campaign_records_select on campaign_vault.campaign_records;
create policy campaign_records_select on campaign_vault.campaign_records
for select to authenticated
using (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor','campaign_viewer']));

drop policy if exists campaign_records_write on campaign_vault.campaign_records;
create policy campaign_records_write on campaign_vault.campaign_records
for all to authenticated
using (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']))
with check (private.is_campaign_member(campaign_id,array['campaign_admin','campaign_editor']));

create or replace function public.radar_campaign_records_v1(p_campaign_id uuid,p_module_key text)
returns jsonb
language sql
stable
security invoker
set search_path=pg_catalog,public,private,campaign_vault,pg_temp
as $$
  select case when private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor','campaign_viewer'])
    then coalesce((select jsonb_agg(to_jsonb(r)-'created_by' order by r.updated_at desc,r.id)
      from campaign_vault.campaign_records r where r.campaign_id=p_campaign_id and r.module_key=p_module_key),'[]'::jsonb)
    else null end
$$;

create or replace function public.radar_save_campaign_record_v1(p_campaign_id uuid,p_record_id uuid,p_record jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path=pg_catalog,public,private,campaign_vault,pg_temp
as $$
declare saved campaign_vault.campaign_records;
  module_value text:=nullif(btrim(p_record->>'module_key'),'');
  category_value text:=nullif(btrim(p_record->>'category'),'');
  title_value text:=nullif(btrim(p_record->>'title'),'');
  payload_value jsonb:=coalesce(p_record->'payload','{}'::jsonb);
begin
  if not private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor']) then raise exception 'campaign access denied' using errcode='42501'; end if;
  if module_value is null or category_value is null or title_value is null then raise exception 'module, category and title are required' using errcode='22023'; end if;
  if jsonb_typeof(payload_value)<>'object' then raise exception 'payload must be an object' using errcode='22023'; end if;
  if p_record_id is null then
    insert into campaign_vault.campaign_records(campaign_id,module_key,category,title,details,status,payload,created_by)
    values(p_campaign_id,module_value,category_value,title_value,nullif(btrim(p_record->>'details'),''),coalesce(nullif(btrim(p_record->>'status'),''),'EN_PROCESO'),payload_value,auth.uid()) returning * into saved;
  else
    update campaign_vault.campaign_records set module_key=module_value,category=category_value,title=title_value,
      details=nullif(btrim(p_record->>'details'),''),status=coalesce(nullif(btrim(p_record->>'status'),''),status),payload=payload_value,updated_at=now()
    where id=p_record_id and campaign_id=p_campaign_id returning * into saved;
    if saved.id is null then raise exception 'campaign record not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved)-'created_by';
end
$$;

create or replace function public.radar_delete_campaign_record_v1(p_campaign_id uuid,p_record_id uuid)
returns boolean
language plpgsql
volatile
security invoker
set search_path=pg_catalog,public,private,campaign_vault,pg_temp
as $$
begin
  if not private.is_campaign_member(p_campaign_id,array['campaign_admin','campaign_editor']) then raise exception 'campaign access denied' using errcode='42501'; end if;
  delete from campaign_vault.campaign_records where campaign_id=p_campaign_id and id=p_record_id;
  return found;
end
$$;

revoke all on function public.radar_campaign_records_v1(uuid,text) from public,anon;
revoke all on function public.radar_save_campaign_record_v1(uuid,uuid,jsonb) from public,anon;
revoke all on function public.radar_delete_campaign_record_v1(uuid,uuid) from public,anon;
grant execute on function public.radar_campaign_records_v1(uuid,text) to authenticated;
grant execute on function public.radar_save_campaign_record_v1(uuid,uuid,jsonb) to authenticated;
grant execute on function public.radar_delete_campaign_record_v1(uuid,uuid) to authenticated;
