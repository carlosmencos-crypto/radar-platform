begin;
do $$ declare actor uuid; campaign uuid; contact uuid:=gen_random_uuid(); code text; r jsonb; vid bigint;
begin
select id into actor from auth.users where raw_app_meta_data->>'platform_role'='super_admin' limit 1;
perform set_config('request.jwt.claim.sub',actor::text,true);
select c.id,m.municipality_code into campaign,code from public.campaigns c join public.municipalities m on m.id=c.municipality_id where not c.is_demo and c.status='active' and m.municipality_code='0301' limit 1;
if campaign is null then raise exception 'No real fixture'; end if;
insert into campaign_vault.contacts(id,campaign_id,full_name) values(contact,campaign,'ROLLBACK responsible real');
r:=private.radar_authorized_contact_directory_page_v1(code); vid:=(r->'items'->0->>'id')::bigint;
perform private.radar_save_contact_profile_v1(code,vid,jsonb_build_object('assigned_contact_id',contact,'assigned_person_name','ROLLBACK responsible real'));
r:=private.radar_authorized_contact_directory_page_v1(code,p_responsible=>contact);
if jsonb_array_length(r->'items')<>1 then raise exception 'Real responsible failed'; end if;
end $$;
rollback; select 'PASS real responsible assignment and filter, rolled back' result;
