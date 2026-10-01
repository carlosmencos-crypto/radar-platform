
create or replace function private.radar_guard_unique_campaign_slot_v1()
returns trigger language plpgsql security definer set search_path=pg_catalog,public,pg_temp as $$
declare occupied boolean; slot text;
begin
 if tg_table_schema not in ('campaign_vault','demo_vault') then raise exception 'Invalid tenant'; end if;
 if tg_table_name='contacts' then
   if not new.active or nullif(btrim(new.candidate_position),'') is null then return new; end if;
   slot:=lower(btrim(new.candidate_position));
   if tg_op='UPDATE' and old.active and new.campaign_id=old.campaign_id and lower(btrim(old.candidate_position))=slot then return new; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.campaign_id::text||':candidate:'||slot,0));
   execute format('select exists(select 1 from %I.contacts where campaign_id=$1 and id<>$2 and active and lower(btrim(candidate_position))=$3)',tg_table_schema)
     into occupied using new.campaign_id,new.id,slot;
   if occupied then raise exception 'Este puesto ya tiene un candidato. Edita su ficha existente.' using errcode='23505'; end if;
 elsif tg_table_name='campaign_records' then
   if new.module_key<>'dia-d' or new.category<>'ASIGNACION_JRV' then return new; end if;
   slot:=((new.payload->>'jrv')::integer)::text;
   if tg_op='UPDATE' and new.campaign_id=old.campaign_id and old.category='ASIGNACION_JRV' and old.payload->>'jrv'=slot then return new; end if;
   perform pg_advisory_xact_lock(hashtextextended(new.campaign_id::text||':jrv:'||slot,0));
   execute format('select exists(select 1 from %I.campaign_records where campaign_id=$1 and id<>$2 and module_key=''dia-d'' and category=''ASIGNACION_JRV'' and (payload->>''jrv'')::integer=$3)',tg_table_schema)
     into occupied using new.campaign_id,new.id,slot::integer;
   if occupied then raise exception 'La JRV ya tiene una asignación. Actualiza la existente.' using errcode='23505'; end if;
 end if;
 return new;
end $$;
revoke all on function private.radar_guard_unique_campaign_slot_v1() from public,anon,authenticated;
do $$ declare tenant text; begin foreach tenant in array array['campaign_vault','demo_vault'] loop
 execute format('create trigger radar_unique_candidate_guard before insert or update on %I.contacts for each row execute function private.radar_guard_unique_campaign_slot_v1()',tenant);
 execute format('create trigger radar_unique_jrv_guard before insert or update on %I.campaign_records for each row execute function private.radar_guard_unique_campaign_slot_v1()',tenant);
end loop; end $$;
