-- Activity notices use the existing approved notice/receipt system.
alter table admin_vault.shared_content add column campaign_id uuid, add column activity_id uuid;
alter table admin_vault.shared_content add constraint shared_activity_notice_scope check (activity_id is null or (campaign_id is not null and kind='notice'));
create unique index shared_activity_notice_unique on admin_vault.shared_content(campaign_id,activity_id) where activity_id is not null;
grant insert on admin_vault.shared_content to service_role;
create or replace function public.radar_admin_shared_activities_v1(p_actor uuid,p_action text,p_input jsonb default '{}')
returns jsonb language plpgsql security invoker set search_path='' as $$
declare batch uuid; existing admin_vault.shared_activity_batches; ids uuid[]; c record; participants jsonb; details_value jsonb;
 activity_id uuid; count_created integer:=0; count_empty integer:=0; result_value jsonb; demo boolean; starts timestamptz;
 title_value text:=nullif(btrim(p_input->>'title'),''); type_value text:=p_input->>'activity_type';
begin
 if current_user<>'service_role' then raise exception 'Acceso administrativo requerido' using errcode='42501'; end if;
 perform public.radar_admin_operator_context_v1(p_actor,'super_admin');
 if p_action='list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,created_at,input->>'title' title,input->>'starts_at' starts_at,input->>'activity_type' activity_type,input->>'is_demo' is_demo,result from admin_vault.shared_activity_batches order by created_at desc limit 30) x),'[]'::jsonb);
 end if;
 if p_action<>'create' then raise exception 'Operación inválida';end if;
 batch:=(p_input->>'request_id')::uuid;
 if batch is null then raise exception 'Identificador de envío requerido';end if;
 perform pg_advisory_xact_lock(hashtextextended(batch::text,0));
 select * into existing from admin_vault.shared_activity_batches where id=batch;
 if found then
  if existing.actor_user_id<>p_actor or existing.input<>p_input then raise exception 'La solicitud ya existe con otros datos';end if;
  return existing.result;
 end if;
 if title_value is null or length(title_value)>180 or length(coalesce(p_input->>'notes',''))>4000 or length(coalesce(p_input->>'community',''))>300 then raise exception 'Revisa título, lugar y descripción';end if;
 if type_value is null or type_value not in ('ASAMBLEA','VISITA','REUNION','MITIN','CAMINATA','EVENTO','RECORRIDO','CAPACITACION','OTRA') then raise exception 'Tipo de actividad inválido';end if;
 if jsonb_typeof(p_input->'is_demo') is distinct from 'boolean' then raise exception 'Selecciona campañas reales o demos';end if;
 demo:=(p_input->>'is_demo')::boolean;
 starts:=(p_input->>'starts_at')::timestamptz;
 if starts is null then raise exception 'Fecha y hora requeridas';end if;
 select array_agg(distinct v::uuid) into ids from jsonb_array_elements_text(p_input->'campaign_ids') t(v);
 if coalesce(cardinality(ids),0) not between 1 and 340 then raise exception 'Selecciona entre 1 y 340 campañas';end if;
 -- Lock the exact campaigns so concurrent closure cannot produce a partial broadcast.
 perform 1 from public.campaigns where id=any(ids) order by id for update;
 if (select count(*) from public.campaigns where id=any(ids) and status='active' and is_demo=demo)<>cardinality(ids) then raise exception 'Una campaña cambió de estado. Actualiza los destinatarios; no se creó ninguna actividad.';end if;
 for c in select id,municipality_id from public.campaigns where id=any(ids) order by id loop
  if demo then
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'role',coalesce(candidate_position,role)) order by full_name,id),'[]'::jsonb) into participants
   from demo_vault.contacts where campaign_id=c.id and active and contact_type='Candidato' and nullif(btrim(full_name),'') is not null;
  else
   select coalesce(jsonb_agg(jsonb_build_object('id',id,'full_name',full_name,'role',coalesce(candidate_position,role)) order by full_name,id),'[]'::jsonb) into participants
   from campaign_vault.contacts where campaign_id=c.id and active and contact_type='Candidato' and nullif(btrim(full_name),'') is not null;
  end if;
  details_value:=jsonb_build_object('item_kind','ACTIVIDAD','admin_activity_batch_id',batch,'created_by_label','Administrador de campaña','responsible_person_id','','responsible','','participant_ids',coalesce((select jsonb_agg(p->'id') from jsonb_array_elements(participants) p),'[]'::jsonb),'participants',participants,'elector_ids','[]'::jsonb,'electors','[]'::jsonb,'manual_participants','');
  if demo then
   insert into demo_vault.activities(campaign_id,title,activity_type,starts_at,community,status,notes,details,created_by) values(c.id,title_value,type_value,starts,nullif(btrim(p_input->>'community'),''),'PLANIFICADA',nullif(btrim(p_input->>'notes'),''),details_value,p_actor) returning id into activity_id;
  else
   insert into campaign_vault.activities(campaign_id,title,activity_type,starts_at,community,status,notes,details,created_by) values(c.id,title_value,type_value,starts,nullif(btrim(p_input->>'community'),''),'PLANIFICADA',nullif(btrim(p_input->>'notes'),''),details_value,p_actor) returning id into activity_id;
  end if;
  insert into admin_vault.shared_content(kind,title,body,status,created_by,campaign_id,activity_id)
  values('notice',title_value,'El administrador de campaña creó una actividad para tu municipio. Abre la ficha para consultar los detalles y, si tienes permiso de edición, completar la información.','PUBLISHED',p_actor,c.id,activity_id);
  count_created:=count_created+1;
  if jsonb_array_length(participants)=0 then count_empty:=count_empty+1;end if;
 end loop;
 result_value:=jsonb_build_object('batch_id',batch,'created',count_created,'without_candidates',count_empty,'is_demo',demo);
 insert into admin_vault.shared_activity_batches(id,actor_user_id,input,result) values(batch,p_actor,p_input,result_value);
 insert into admin_vault.audit_events(request_id,actor_user_id,actor_role,action,entity_type,entity_id,after_state,reason)
 values(batch,p_actor,'super_admin','create_shared_activity','shared_activity_batch',batch::text,result_value,'Actividad central publicada en campañas seleccionadas');
 return result_value;
end;$$;

-- Preserve existing membership authorization and per-user acknowledgments.
create or replace function public.radar_shared_content_v1(p_campaign_id uuid) returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public,admin_vault,pg_temp as $$
declare municipality text; demo boolean;
begin
 if auth.uid() is null or not private.is_campaign_member(p_campaign_id,null) then raise exception 'Acceso no autorizado' using errcode='42501'; end if;
 select m.municipality_code,c.is_demo into municipality,demo from public.campaigns c join public.municipalities m on m.id=c.municipality_id where c.id=p_campaign_id and c.status='active';
 if not found then raise exception 'Campaña no activa'; end if;
 return (select coalesce(jsonb_agg(to_jsonb(c)-'created_by' order by c.created_at,c.id),'[]') from admin_vault.shared_content c
 where status='PUBLISHED' and starts_at<=now() and (ends_at is null or ends_at>now())
 and (c.municipality_code is null or c.municipality_code=municipality)
 and (c.campaign_id is null or c.campaign_id=p_campaign_id)
 and (c.activity_id is null or (demo and exists(select 1 from demo_vault.activities a where a.id=c.activity_id and a.campaign_id=p_campaign_id)) or (not demo and exists(select 1 from campaign_vault.activities a where a.id=c.activity_id and a.campaign_id=p_campaign_id)))
 and (kind='resource' or not exists(select 1 from admin_vault.notice_receipts r where r.content_id=c.id and r.user_id=auth.uid())));
end $$;
