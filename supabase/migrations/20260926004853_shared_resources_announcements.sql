create table admin_vault.shared_content (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('resource','notice')),
 title text not null check(length(trim(title))>0),body text not null default '',category text,
 storage_path text,file_name text,version text not null default '1',
 municipality_code text check(municipality_code is null or municipality_code ~ '^[0-9]{4}$'),
 starts_at timestamptz not null default now(),ends_at timestamptz,
 status text not null default 'DRAFT' check(status in ('DRAFT','PUBLISHED','ARCHIVED')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 check(ends_at is null or ends_at>starts_at),check(kind<>'resource' or storage_path is not null)
);
alter table admin_vault.shared_content enable row level security;
create table admin_vault.notice_receipts(content_id uuid references admin_vault.shared_content(id),user_id uuid references auth.users(id),seen_at timestamptz default now(),primary key(content_id,user_id));
alter table admin_vault.notice_receipts enable row level security;
revoke all on admin_vault.shared_content,admin_vault.notice_receipts from anon,authenticated;

create or replace function public.radar_admin_content_v1(p_actor_user_id uuid,p_actor_role text,p_operation text,p_input jsonb default '{}') returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare saved admin_vault.shared_content; previous admin_vault.shared_content;
begin
 if p_actor_role is distinct from 'super_admin' then raise exception 'Solo superadministradores'; end if;
 perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
 if not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
 if p_operation='list' then return (select coalesce(jsonb_agg(to_jsonb(c) order by created_at desc),'[]') from admin_vault.shared_content c); end if;
 if p_operation='save' then
  if nullif(p_input->>'municipality_code','') is not null and not exists(select 1 from public.municipalities where municipality_code=p_input->>'municipality_code' and not is_synthetic) then raise exception 'Municipio inválido'; end if;
  insert into admin_vault.shared_content(kind,title,body,category,storage_path,file_name,version,municipality_code,starts_at,ends_at,created_by)
  values(p_input->>'kind',trim(p_input->>'title'),coalesce(p_input->>'body',''),p_input->>'category',p_input->>'storage_path',p_input->>'file_name',coalesce(nullif(p_input->>'version',''),'1'),nullif(p_input->>'municipality_code',''),coalesce(nullif(p_input->>'starts_at','')::timestamptz,now()),nullif(p_input->>'ends_at','')::timestamptz,p_actor_user_id) returning * into saved;
 elsif p_operation in ('publish','archive') then
  select * into previous from admin_vault.shared_content where id=(p_input->>'id')::uuid for update;
  if not found then raise exception 'Publicación inexistente'; end if;
  update admin_vault.shared_content set status=case when p_operation='publish' then 'PUBLISHED' else 'ARCHIVED' end where id=previous.id returning * into saved;
 else raise exception 'Operación inválida'; end if;
 perform public.radar_admin_audit_v1(p_actor_user_id,p_actor_role,'CONTENT_'||upper(p_operation),'SHARED_CONTENT',saved.id::text,to_jsonb(previous),to_jsonb(saved),'Publicación gestionada desde Recursos y Avisos');
 return to_jsonb(saved);
end $$;
revoke all on function public.radar_admin_content_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_content_v1(uuid,text,text,jsonb) to service_role;

create or replace function public.radar_shared_content_v1(p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality text;
begin
 if auth.uid() is null or not private.is_campaign_member(p_campaign_id,null) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select m.municipality_code into municipality from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id and c.status='active';
 if not found then raise exception 'Campaña no activa'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(c)-'created_by'),'[]') from admin_vault.shared_content c where status='PUBLISHED' and starts_at<=now() and (ends_at is null or ends_at>now()) and (c.municipality_code is null or c.municipality_code=municipality) and (kind='resource' or not exists(select 1 from admin_vault.notice_receipts r where r.content_id=c.id and r.user_id=auth.uid())));
end $$;
revoke all on function public.radar_shared_content_v1(uuid) from public,anon;
grant execute on function public.radar_shared_content_v1(uuid) to authenticated;

create or replace function public.radar_ack_notice_v1(p_campaign_id uuid,p_content_id uuid) returns boolean language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
begin
 if not exists(select 1 from jsonb_array_elements(public.radar_shared_content_v1(p_campaign_id)) x where x->>'id'=p_content_id::text and x->>'kind'='notice') then raise exception 'Aviso no disponible'; end if;
 insert into admin_vault.notice_receipts(content_id,user_id) values(p_content_id,auth.uid()) on conflict do nothing;
 return true;
end $$;
revoke all on function public.radar_ack_notice_v1(uuid,uuid) from public,anon;
grant execute on function public.radar_ack_notice_v1(uuid,uuid) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit) values('radar-shared-resources','radar-shared-resources',false,26214400) on conflict(id) do nothing;
create or replace function private.can_read_shared_resource(target_path text) returns boolean language sql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
 select exists(select 1 from admin_vault.shared_content s where s.storage_path=target_path and s.kind='resource' and s.status='PUBLISHED' and s.starts_at<=now() and (s.ends_at is null or s.ends_at>now()) and exists(select 1 from public.campaign_members cm join public.campaigns c on c.id=cm.campaign_id and c.status='active' join public.profiles p on p.user_id=cm.user_id and p.is_active join public.municipalities m on m.id=c.municipality_id where cm.user_id=auth.uid() and (s.municipality_code is null or s.municipality_code=m.municipality_code)))
$$;
revoke all on function private.can_read_shared_resource(text) from public,anon;
grant execute on function private.can_read_shared_resource(text) to authenticated;
create policy shared_resource_member_read on storage.objects for select to authenticated using(bucket_id='radar-shared-resources' and private.can_read_shared_resource(name));
