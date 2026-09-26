begin;
do $$
declare actor uuid; org uuid; a uuid; b uuid; c uuid; demo uuid; ma public.municipalities; mb public.municipalities; result jsonb; input jsonb; blocked boolean:=false;
begin
 select user_id into actor from public.profiles where platform_role='super_admin' and is_active limit 1;
 select * into ma from public.municipalities where not is_synthetic order by municipality_code limit 1;
 select * into mb from public.municipalities where not is_synthetic and municipality_code<>ma.municipality_code order by municipality_code limit 1;
 insert into public.organizations(name,slug,country_code) values('RTD rollback fixture',gen_random_uuid()::text,'GT') returning id into org;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(org,'GT',ma.id,'A',gen_random_uuid()::text,false,'active') returning id into a;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(org,'GT',ma.id,'B',gen_random_uuid()::text,false,'active') returning id into b;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(org,'GT',mb.id,'C',gen_random_uuid()::text,false,'active') returning id into c;
 insert into public.campaigns(organization_id,country_code,municipality_id,name,slug,is_demo,status) values(org,'GT',ma.id,'Demo',gen_random_uuid()::text,true,'active') returning id into demo;
 insert into campaign_vault.fiscales(campaign_id,full_name,status) values(a,'Fictional fiscal A','active'),(c,'Fictional fiscal C','active');
 insert into campaign_vault.rtd_results(campaign_id,election_type,election_cycle,election_round,voting_center_code,jrv_code,results,blank_votes,null_votes,total_ballots,status) values
 (a,'PRESIDENTE',2099,1,'TEST','001','[{"party_id":"TEST","party_name":"Test","votes":10}]',2,3,100,'confirmed'),
 (b,'PRESIDENTE',2099,1,'TEST','1','[{"party_id":"TEST","party_name":"Test","votes":10}]',2,3,100,'validated'),
 (c,'PRESIDENTE',2099,1,'TEST','001','[{"party_id":"TEST","party_name":"Test","votes":20}]',2,3,100,'confirmed'),
 (a,'PRESIDENTE',2099,1,'TEST','002','[{"party_id":"TEST","votes":5}]',0,0,100,'confirmed'),
 (b,'PRESIDENTE',2099,1,'TEST','2','[{"party_id":"TEST","votes":7}]',0,0,100,'confirmed'),
 (a,'PRESIDENTE',2099,1,'TEST','003','[{"party_id":"TEST","votes":99}]',0,0,100,'draft'),
 (a,'PRESIDENTE',2099,1,'TEST','004','[{"party_id":"TEST","votes":-1}]',0,0,100,'confirmed'),
 (a,'PRESIDENTE',2098,1,'TEST','005','[{"party_id":"TEST","votes":99}]',0,0,100,'confirmed'),
 (demo,'PRESIDENTE',2099,1,'TEST','006','[{"party_id":"TEST","votes":99}]',0,0,100,'confirmed');
 input:='{"election_type":"PRESIDENTE","election_cycle":2099,"election_round":1}';
 result:=public.radar_admin_national_rtd_v1(actor,'super_admin',input);
 if result#>>'{summary,valid_votes}'<>'30' or result#>>'{summary,counted}'<>'2' or result#>>'{summary,conflicts}'<>'1' or result#>>'{summary,duplicates}'<>'1' or result#>>'{summary,pending}'<>'2' or result#>>'{summary,blank_votes}'<>'4' or result#>>'{summary,null_votes}'<>'6' then raise exception 'Invalid consolidation: %',result; end if;
 result:=public.radar_admin_national_rtd_v1(actor,'super_admin',input||jsonb_build_object('municipality_code',mb.municipality_code));
 if result#>>'{summary,valid_votes}'<>'20' then raise exception 'Municipality filter failed'; end if;
 insert into campaign_vault.rtd_results(campaign_id,election_type,election_cycle,election_round,electoral_district_code,voting_center_code,jrv_code,results,blank_votes,null_votes,total_ballots,status)
 select campaign_id,election,2099,1,'TEST-DISTRICT',voting_center_code,jrv_code,results,blank_votes,null_votes,total_ballots,status from campaign_vault.rtd_results cross join (values ('ALCALDIA'),('DIP_DIST'),('DIP_NAC')) types(election) where campaign_id in (a,c) and election_type='PRESIDENTE' and jrv_code='001';
 result:=public.radar_admin_national_rtd_v1(actor,'super_admin',input||'{"election_type":"ALCALDIA"}');
 if jsonb_array_length(result->'territories')<>2 or jsonb_array_length(result->'results')<>2 then raise exception 'Municipal candidates incorrectly combined'; end if;
 result:=public.radar_admin_national_rtd_v1(actor,'super_admin',input||'{"election_type":"DIP_DIST"}');
 if jsonb_array_length(result->'territories')<>1 or result#>>'{results,0,votes}'<>'30' then raise exception 'District consolidation failed'; end if;
 result:=public.radar_admin_national_rtd_v1(actor,'super_admin',input||'{"election_type":"DIP_NAC"}');
 if result#>>'{results,0,votes}'<>'30' then raise exception 'National list consolidation failed'; end if;
 begin perform public.radar_admin_national_rtd_v1(actor,'rtd_ops',input); exception when insufficient_privilege then blocked:=true; end;
 if not blocked or has_function_privilege('authenticated','public.radar_admin_national_rtd_v1(uuid,text,jsonb)','EXECUTE') then raise exception 'National scope exposed'; end if;
end $$;
rollback;
select 'PASS: vote sums, duplicate exclusion, conflict exclusion, pending/invalid records, cycle/demo isolation, municipal/district/national grouping and restricted access; fixtures rolled back.' result;
