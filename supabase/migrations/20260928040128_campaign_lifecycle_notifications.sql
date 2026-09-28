-- Lifecycle changes and notification intent commit together. Auth accounts are never deleted.
create table admin_vault.campaign_archives (
 campaign_id uuid primary key references public.campaigns(id) on delete cascade,
 members jsonb not null default '[]', contact_profiles jsonb not null default '[]',
 concluded_at timestamptz not null default now()
);
create table admin_vault.lifecycle_mail (
 id uuid primary key default gen_random_uuid(), event_key text not null unique,
 campaign_id uuid references public.campaigns(id) on delete set null,
 kind text not null check(kind in ('concluded','reactivated','deleted')),
 recipient text not null, municipality_name text not null, municipality_code text not null,
 status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
 attempts integer not null default 0, last_error text, created_at timestamptz not null default now(), sent_at timestamptz
);
alter table admin_vault.campaign_archives enable row level security;
alter table admin_vault.lifecycle_mail enable row level security;
revoke all on admin_vault.campaign_archives,admin_vault.lifecycle_mail from public,anon,authenticated;

create function admin_vault.queue_lifecycle_mail(p_campaign uuid,p_kind text,p_event text) returns uuid
language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare mail_id uuid;
begin
 insert into admin_vault.lifecycle_mail(event_key,campaign_id,kind,recipient,municipality_name,municipality_code)
 select p_event,c.id,p_kind,a.administrator_email,m.municipality_name,m.municipality_code
 from public.campaigns c join admin_vault.client_accounts a on a.campaign_id=c.id
 join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign
 on conflict(event_key) do update set event_key=excluded.event_key returning id into mail_id;
 return mail_id;
end $$;
revoke all on function admin_vault.queue_lifecycle_mail(uuid,text,text) from public,anon,authenticated;

-- Private, user-owned directory annotations must not follow a reused account into a new campaign.
create function admin_vault.archive_campaign_workspace(p_campaign uuid) returns void
language plpgsql security definer set search_path=pg_catalog,public,admin_vault,campaign_vault,pg_temp as $$
begin
 insert into admin_vault.campaign_archives(campaign_id,members,contact_profiles)
 select c.id,
 coalesce((select jsonb_agg(to_jsonb(cm)) from public.campaign_members cm where cm.campaign_id=c.id),'[]'),
 coalesce((select jsonb_agg(to_jsonb(cp)) from campaign_vault.contact_workspace_profiles cp
 where cp.municipality_id=c.municipality_id and exists(select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=cp.owner_id)),'[]')
 from public.campaigns c where c.id=p_campaign
 on conflict(campaign_id) do update set members=excluded.members,contact_profiles=excluded.contact_profiles,concluded_at=now();
 delete from campaign_vault.contact_workspace_profiles cp using public.campaigns c
 where c.id=p_campaign and cp.municipality_id=c.municipality_id
 and exists(select 1 from public.campaign_members cm where cm.campaign_id=c.id and cm.user_id=cp.owner_id);
end $$;
revoke all on function admin_vault.archive_campaign_workspace(uuid) from public,anon,authenticated;

alter function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) rename to radar_admin_release_contract_core_v1;
create function public.radar_admin_release_contract_v1(p_actor_user_id uuid,p_actor_role text,p_contract_id uuid,p_confirmation text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare c admin_vault.commercial_contracts; result jsonb; mail_id uuid;
begin
 -- Core performs full operator checks; all earlier effects roll back on failure.
 perform 1 from public.municipalities m join admin_vault.commercial_contracts ct on ct.municipality_id=m.id where ct.id=p_contract_id for update of m;
 select * into c from admin_vault.commercial_contracts where id=p_contract_id for update;
 if c.status='ENDED' then
  perform public.radar_admin_operator_context_v1(p_actor_user_id,p_actor_role);
  if p_actor_role is distinct from 'super_admin' or not exists(select 1 from auth.users where id=p_actor_user_id and raw_app_meta_data->>'platform_role'='super_admin') then raise exception 'Actor no autorizado'; end if;
  return jsonb_build_object('contract_id',c.id,'status','ENDED','mail_id',(select id from admin_vault.lifecycle_mail where event_key='concluded:'||c.id));
 end if;
 if c.campaign_id is not null then
  perform 1 from public.campaigns where id=c.campaign_id for update;
  perform admin_vault.archive_campaign_workspace(c.campaign_id);
 end if;
 result:=public.radar_admin_release_contract_core_v1(p_actor_user_id,p_actor_role,p_contract_id,p_confirmation,p_reason);
 mail_id:=admin_vault.queue_lifecycle_mail(c.campaign_id,'concluded','concluded:'||c.id);
 return result||jsonb_build_object('mail_id',mail_id);
end $$;
revoke all on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) from public,anon,authenticated;
grant execute on function public.radar_admin_release_contract_v1(uuid,text,uuid,text,text) to service_role;

alter function public.radar_admin_clients_v1(uuid,text,text,jsonb) rename to radar_admin_clients_core_v1;
create function public.radar_admin_clients_v1(p_actor_user_id uuid,p_actor_role text,p_operation text,p_input jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,campaign_vault,pg_temp as $$
declare result jsonb; target uuid; administrator uuid; mail_id uuid; contract_id uuid; arch admin_vault.campaign_archives;
begin
 if p_operation<>'reactivate' then return public.radar_admin_clients_core_v1(p_actor_user_id,p_actor_role,p_operation,p_input); end if;
 target:=(p_input->>'campaign_id')::uuid;
 -- Lock municipality first: onboarding/reactivation cannot acquire the same territory together.
 perform 1 from public.municipalities m join public.campaigns c on c.municipality_id=m.id where c.id=target for update of m;
 perform 1 from public.campaigns where id=target for update;
 if nullif(p_input->>'valid_until','') is null or (p_input->>'valid_until')::date<current_date then raise exception 'Selecciona una vigencia futura'; end if;
 select u.id into administrator from admin_vault.client_accounts a join auth.users u on lower(u.email)=lower(a.administrator_email)
 join public.profiles p on p.user_id=u.id and p.is_active where a.campaign_id=target;
 if administrator is null then raise exception 'El administrador de contacto no tiene una cuenta activa. Revisa su cuenta antes de reactivar.'; end if;
 result:=public.radar_admin_clients_core_v1(p_actor_user_id,p_actor_role,p_operation,p_input);
 insert into public.campaign_members(campaign_id,user_id,member_role) values(target,administrator,'campaign_admin')
 on conflict(campaign_id,user_id) do update set member_role=excluded.member_role;
 select * into arch from admin_vault.campaign_archives where campaign_id=target;
 insert into campaign_vault.contact_workspace_profiles(owner_id,source_id,record_id,municipality_id,profile,updated_at)
 select x.owner_id,x.source_id,x.record_id,x.municipality_id,x.profile,x.updated_at
 from jsonb_populate_recordset(null::campaign_vault.contact_workspace_profiles,coalesce(arch.contact_profiles,'[]')) x
 where exists(select 1 from auth.users u where u.id=x.owner_id)
 on conflict(owner_id,source_id,record_id) do update set profile=excluded.profile,updated_at=excluded.updated_at;
 delete from admin_vault.campaign_archives where campaign_id=target;
 select id into contract_id from admin_vault.commercial_contracts where campaign_id=target and status='ACTIVE' order by created_at desc limit 1;
 mail_id:=admin_vault.queue_lifecycle_mail(target,'reactivated','reactivated:'||contract_id);
 return result||jsonb_build_object('mail_id',mail_id,'administrator_restored',true);
end $$;
revoke all on function public.radar_admin_clients_v1(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_clients_v1(uuid,text,text,jsonb) to service_role;

alter function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) rename to radar_admin_purge_campaign_core_v1;
create function public.radar_admin_purge_campaign_v1(p_actor_user_id uuid,p_actor_role text,p_input jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare result jsonb; target uuid:=(p_input->>'campaign_id')::uuid; mail_id uuid;
begin
 perform 1 from public.municipalities m join public.campaigns c on c.municipality_id=m.id where c.id=target for update of m;
 perform 1 from public.campaigns where id=target for update;
 -- Never claim file deletion while physical objects still exist. Storage removal requires its API.
 if exists(select 1 from storage.objects where name like '%'||target::text||'%') then raise exception 'Esta campaña contiene archivos alojados. Retíralos de Storage antes del borrado definitivo.'; end if;
 if exists(select 1 from public.campaign_members where campaign_id=target) then perform admin_vault.archive_campaign_workspace(target); end if;
 -- Remove superseded mail payloads before permanent erasure; keep only its delivery receipt.
 delete from admin_vault.lifecycle_mail where campaign_id=target;
 mail_id:=admin_vault.queue_lifecycle_mail(target,'deleted','deleted:'||target);
 result:=public.radar_admin_purge_campaign_core_v1(p_actor_user_id,p_actor_role,p_input);
 return result||jsonb_build_object('mail_id',mail_id);
end $$;
revoke all on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.radar_admin_purge_campaign_v1(uuid,text,jsonb) to service_role;
-- The old core implementations are internal only.
revoke all on function public.radar_admin_release_contract_core_v1(uuid,text,uuid,text,text),public.radar_admin_clients_core_v1(uuid,text,text,jsonb),public.radar_admin_purge_campaign_core_v1(uuid,text,jsonb) from public,anon,authenticated,service_role;

create function public.radar_lifecycle_mail_v1(p_operation text,p_id uuid default null,p_error text default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,admin_vault,pg_temp as $$
declare item admin_vault.lifecycle_mail;
begin
 if p_operation='list' then return (select coalesce(jsonb_agg(to_jsonb(t)),'[]') from (select id,kind,recipient,municipality_name,status,last_error,created_at,sent_at from admin_vault.lifecycle_mail order by created_at desc limit 30)t); end if;
 if p_operation='claim' then
  update admin_vault.lifecycle_mail set status='sending',attempts=attempts+1,last_error=null where id=p_id and status in ('pending','failed') returning * into item;
  return case when item.id is null then null else to_jsonb(item) end;
 elsif p_operation='sent' then
  update admin_vault.lifecycle_mail set status='sent',sent_at=now(),last_error=null where id=p_id and status='sending';
 elsif p_operation='failed' then
  update admin_vault.lifecycle_mail set status='failed',last_error=left(p_error,240) where id=p_id and status='sending';
 else raise exception 'Operación de correo inválida'; end if;
 return jsonb_build_object('id',p_id);
end $$;
revoke all on function public.radar_lifecycle_mail_v1(text,uuid,text) from public,anon,authenticated;
grant execute on function public.radar_lifecycle_mail_v1(text,uuid,text) to service_role;

-- Always derive membership from the authenticated identity, never a caller-supplied user ID.
create function public.radar_my_campaigns_v1() returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,public,admin_vault,pg_temp as $$
begin
 if auth.uid() is null then raise exception 'Inicia sesión para continuar' using errcode='42501'; end if;
 return jsonb_build_object('universal',exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id where p.user_id=auth.uid() and p.is_active and p.platform_role='platform_admin' and u.raw_app_meta_data->>'platform_role'='super_admin'),
 'campaigns',(select coalesce(jsonb_agg(jsonb_build_object('campaign_id',c.id,'name',c.name,'municipality_code',m.municipality_code,'municipality_name',m.municipality_name,'department_name',m.department_name,'role',cm.member_role) order by m.municipality_name),'[]')
 from public.campaign_members cm join public.campaigns c on c.id=cm.campaign_id join public.municipalities m on m.id=c.municipality_id
 where cm.user_id=auth.uid() and not c.is_demo and private.is_campaign_member(c.id,null)));
end $$;
revoke all on function public.radar_my_campaigns_v1() from public,anon;
grant execute on function public.radar_my_campaigns_v1() to authenticated;
