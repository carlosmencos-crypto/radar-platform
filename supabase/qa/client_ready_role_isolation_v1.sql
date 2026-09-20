begin;

create temporary table client_ready_role_qa (
  test_name text primary key,
  ok boolean not null check (ok),
  details jsonb not null
) on commit preserve rows;

grant select, insert on client_ready_role_qa to authenticated;

select set_config(
  'qa.campaign_1',
  (
    select c.id::text
    from public.campaigns c
    join public.municipalities m on m.id = c.municipality_id
    where c.status = 'active' and c.is_demo = false and m.municipality_code = '0509'
    limit 1
  ),
  true
);
select set_config(
  'qa.campaign_2',
  (
    select c.id::text
    from public.campaigns c
    join public.municipalities m on m.id = c.municipality_id
    where c.status = 'active' and c.is_demo = false and m.municipality_code = '1208'
    limit 1
  ),
  true
);
select set_config(
  'qa.organization',
  (select organization_id::text from public.campaigns where id = current_setting('qa.campaign_1')::uuid),
  true
);
select set_config(
  'qa.municipality_1',
  (select municipality_id::text from public.campaigns where id = current_setting('qa.campaign_1')::uuid),
  true
);

insert into client_ready_role_qa values (
  'preconditions_two_real_campaigns',
  current_setting('qa.campaign_1', true) is not null
    and current_setting('qa.campaign_2', true) is not null
    and current_setting('qa.campaign_1') <> current_setting('qa.campaign_2'),
  jsonb_build_object('municipalities', array['0509','1208'])
);

insert into auth.users (
  id, aud, role, email, raw_app_meta_data, raw_user_meta_data,
  is_super_admin, created_at, updated_at, is_sso_user, is_anonymous
) values
  ('00000000-0000-4000-8000-0000000000a1','authenticated','authenticated','qa-role-admin@invalid.local','{"provider":"email","providers":["email"]}','{}',false,now(),now(),false,false),
  ('00000000-0000-4000-8000-0000000000a2','authenticated','authenticated','qa-role-editor@invalid.local','{"provider":"email","providers":["email"]}','{}',false,now(),now(),false,false),
  ('00000000-0000-4000-8000-0000000000a3','authenticated','authenticated','qa-role-viewer@invalid.local','{"provider":"email","providers":["email"]}','{}',false,now(),now(),false,false),
  ('00000000-0000-4000-8000-0000000000a4','authenticated','authenticated','qa-role-clean@invalid.local','{"provider":"email","providers":["email"]}','{}',false,now(),now(),false,false),
  ('00000000-0000-4000-8000-0000000000a5','authenticated','authenticated','qa-role-platform@invalid.local','{"provider":"email","providers":["email"]}','{}',false,now(),now(),false,false)
on conflict (id) do nothing;

insert into public.profiles (user_id, display_name, platform_role, organization_id, is_active)
values
  ('00000000-0000-4000-8000-0000000000a1','QA campaign admin','user',current_setting('qa.organization')::uuid,true),
  ('00000000-0000-4000-8000-0000000000a2','QA campaign editor','user',current_setting('qa.organization')::uuid,true),
  ('00000000-0000-4000-8000-0000000000a3','QA campaign viewer','user',current_setting('qa.organization')::uuid,true),
  ('00000000-0000-4000-8000-0000000000a4','QA clean client','user',null,true),
  ('00000000-0000-4000-8000-0000000000a5','QA platform admin','platform_admin',null,true)
on conflict (user_id) do update set
  display_name = excluded.display_name,
  platform_role = excluded.platform_role,
  organization_id = excluded.organization_id,
  is_active = excluded.is_active,
  updated_at = now();

insert into public.campaign_members (campaign_id, user_id, member_role)
values
  (current_setting('qa.campaign_1')::uuid,'00000000-0000-4000-8000-0000000000a1','campaign_admin'),
  (current_setting('qa.campaign_1')::uuid,'00000000-0000-4000-8000-0000000000a2','campaign_editor'),
  (current_setting('qa.campaign_1')::uuid,'00000000-0000-4000-8000-0000000000a3','campaign_viewer')
on conflict (campaign_id, user_id) do update set member_role = excluded.member_role;

insert into campaign_vault.contacts (id, campaign_id, full_name, created_by)
values
  ('00000000-0000-4000-8000-0000000000b1',current_setting('qa.campaign_1')::uuid,'QA admin row','00000000-0000-4000-8000-0000000000a1'),
  ('00000000-0000-4000-8000-0000000000b2',current_setting('qa.campaign_1')::uuid,'QA editor row','00000000-0000-4000-8000-0000000000a2'),
  ('00000000-0000-4000-8000-0000000000b3',current_setting('qa.campaign_1')::uuid,'QA viewer row','00000000-0000-4000-8000-0000000000a3'),
  ('00000000-0000-4000-8000-0000000000b4',current_setting('qa.campaign_2')::uuid,'QA foreign campaign row','00000000-0000-4000-8000-0000000000a5')
on conflict (id) do update set full_name = excluded.full_name, notes = null;

set local role authenticated;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a1',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}',true);
insert into client_ready_role_qa
select 'campaign_admin_context',
  count(*) = 1 and bool_and(user_role = 'campaign_admin') and bool_and('campaign_vault:write' = any(permissions)),
  jsonb_build_object('rows',count(*),'roles',jsonb_agg(user_role),'permissions',jsonb_agg(permissions))
from public.radar_authorized_context_v2('municipality','0509');
insert into client_ready_role_qa
select 'campaign_admin_isolation',
  count(*) = 3 and count(*) filter (where campaign_id = current_setting('qa.campaign_2')::uuid) = 0,
  jsonb_build_object('visible_contacts',count(*),'foreign_contacts',count(*) filter (where campaign_id = current_setting('qa.campaign_2')::uuid))
from campaign_vault.contacts
where id in (
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000b3',
  '00000000-0000-4000-8000-0000000000b4'
);
with changed as (
  update campaign_vault.contacts set notes = 'admin-updated'
  where id = '00000000-0000-4000-8000-0000000000b1'
  returning id
)
insert into client_ready_role_qa
select 'campaign_admin_write', count(*) = 1, jsonb_build_object('updated_rows',count(*)) from changed;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a2',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}',true);
insert into client_ready_role_qa
select 'campaign_editor_context',
  count(*) = 1 and bool_and(user_role = 'campaign_editor') and bool_and('campaign_vault:write' = any(permissions)),
  jsonb_build_object('rows',count(*),'roles',jsonb_agg(user_role),'permissions',jsonb_agg(permissions))
from public.radar_authorized_context_v2('municipality','0509');
with changed as (
  update campaign_vault.contacts set notes = 'editor-updated'
  where id = '00000000-0000-4000-8000-0000000000b2'
  returning id
)
insert into client_ready_role_qa
select 'campaign_editor_write', count(*) = 1, jsonb_build_object('updated_rows',count(*)) from changed;
with removed as (
  delete from campaign_vault.contacts
  where id = '00000000-0000-4000-8000-0000000000b2'
  returning id
)
insert into client_ready_role_qa
select 'campaign_editor_delete_denied', count(*) = 0, jsonb_build_object('deleted_rows',count(*)) from removed;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a3',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a3","role":"authenticated"}',true);
insert into client_ready_role_qa
select 'campaign_viewer_context',
  count(*) = 1 and bool_and(user_role = 'campaign_viewer') and bool_and(not ('campaign_vault:write' = any(permissions))),
  jsonb_build_object('rows',count(*),'roles',jsonb_agg(user_role),'permissions',jsonb_agg(permissions))
from public.radar_authorized_context_v2('municipality','0509');
with changed as (
  update campaign_vault.contacts set notes = 'viewer-must-not-write'
  where id = '00000000-0000-4000-8000-0000000000b3'
  returning id
)
insert into client_ready_role_qa
select 'campaign_viewer_write_denied', count(*) = 0, jsonb_build_object('updated_rows',count(*)) from changed;
insert into client_ready_role_qa
select 'campaign_viewer_data_vault', count(*) > 0, jsonb_build_object('layer_rows',count(*))
from data_vault.municipality_layer_records
where municipality_id = current_setting('qa.municipality_1')::uuid;

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a4',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a4","role":"authenticated"}',true);
insert into client_ready_role_qa
select 'clean_client_default_deny',
  (select count(*) from public.radar_authorized_context_v2('municipality','0509')) = 0
    and (select count(*) from public.campaigns) = 0
    and (select count(*) from campaign_vault.contacts) = 0
    and (select count(*) from data_vault.municipality_intelligence_profiles_v1) = 0,
  jsonb_build_object(
    'contexts',(select count(*) from public.radar_authorized_context_v2('municipality','0509')),
    'campaigns',(select count(*) from public.campaigns),
    'contacts',(select count(*) from campaign_vault.contacts),
    'profiles',(select count(*) from data_vault.municipality_intelligence_profiles_v1)
  );

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-0000000000a5',true);
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-0000000000a5","role":"authenticated"}',true);
insert into client_ready_role_qa
select 'platform_admin_clean_context',
  count(*) = 1
    and bool_and(user_role = 'platform_admin')
    and bool_and(campaign_id is null)
    and bool_and('data_vault:read' = any(permissions))
    and bool_and(not ('campaign_vault:read' = any(permissions))),
  jsonb_build_object('rows',count(*),'campaign_ids',jsonb_agg(campaign_id),'permissions',jsonb_agg(permissions))
from public.radar_authorized_context_v2('municipality','0101');
insert into client_ready_role_qa
select 'platform_admin_national_read',
  count(*) = 2,
  jsonb_build_object('active_real_campaigns',count(*))
from public.campaigns where status = 'active' and is_demo = false;

reset role;

delete from campaign_vault.contacts
where id in (
  '00000000-0000-4000-8000-0000000000b1',
  '00000000-0000-4000-8000-0000000000b2',
  '00000000-0000-4000-8000-0000000000b3',
  '00000000-0000-4000-8000-0000000000b4'
);
delete from public.campaign_members
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3'
);
delete from public.profiles
where user_id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3',
  '00000000-0000-4000-8000-0000000000a4',
  '00000000-0000-4000-8000-0000000000a5'
);
delete from auth.users
where id in (
  '00000000-0000-4000-8000-0000000000a1',
  '00000000-0000-4000-8000-0000000000a2',
  '00000000-0000-4000-8000-0000000000a3',
  '00000000-0000-4000-8000-0000000000a4',
  '00000000-0000-4000-8000-0000000000a5'
);

insert into client_ready_role_qa
select 'ephemeral_cleanup',
  (select count(*) from auth.users where id::text like '00000000-0000-4000-8000-0000000000a%') = 0
    and (select count(*) from campaign_vault.contacts where id::text like '00000000-0000-4000-8000-0000000000b%') = 0,
  jsonb_build_object(
    'qa_users',(select count(*) from auth.users where id::text like '00000000-0000-4000-8000-0000000000a%'),
    'qa_contacts',(select count(*) from campaign_vault.contacts where id::text like '00000000-0000-4000-8000-0000000000b%')
  );

commit;

select test_name, ok, details
from client_ready_role_qa
order by test_name;
