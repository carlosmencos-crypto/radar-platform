-- Derive one history entry from each saved activity, never duplicate a manual
-- interaction or copy private data across campaigns. Edits/deletions stay in sync.
create function private.activity_voter_history(p_municipality_id uuid,p_voter_id bigint,p_demo_campaign uuid default null)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id','activity:'||a.id::text,'activity_id',a.id,'interaction_type','REUNION',
    'interaction_at',coalesce(a.starts_at,a.created_at),'responsible_name',a.details->>'responsible',
    'notes',a.title||' · '||initcap(lower(a.status)), 'activity_status',a.status)
    order by coalesce(a.starts_at,a.created_at) desc,a.id),'[]'::jsonb)
  from (
    select a.id,a.starts_at,a.created_at,a.title,a.status,a.details
    from campaign_vault.activities a join public.campaigns c on c.id=a.campaign_id
    where p_demo_campaign is null and c.is_demo=false and c.municipality_id=p_municipality_id
      and private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer'])
      and (a.details->'elector_ids') @> jsonb_build_array(p_voter_id)
    union all
    select a.id,a.starts_at,a.created_at,a.title,a.status,a.details
    from demo_vault.activities a join public.campaigns c on c.id=a.campaign_id
    where p_demo_campaign is not null and c.id=p_demo_campaign and c.is_demo=true
      and c.municipality_id=p_municipality_id and private.can_use_demo_campaign(c.id)
      and (a.details->'elector_ids') @> jsonb_build_array(p_voter_id)
  ) a where (select auth.uid()) is not null;
$$;
revoke all on function private.activity_voter_history(uuid,bigint,uuid) from public,anon,authenticated;

-- Apply only to the verified detail projections. Abort if their shape changed.
do $$
declare name text; definition text; old_text text; new_text text;
begin
  foreach name in array array['private.radar_authorized_nominal_detail_v1(text,bigint)',
    'private.radar_demo_authorized_nominal_detail_v1(uuid,text,bigint)'] loop
    definition:=pg_get_functiondef(name::regprocedure);
    old_text:='''[]''::jsonb),';
    new_text:='''[]''::jsonb) || private.activity_voter_history(m.id,p_voter_id,'||
      case when name like '%demo_%' then 'p_demo_campaign' else 'null::uuid' end||'),';
    if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
      raise exception 'Unexpected voter detail definition: %',name;
    end if;
    execute replace(definition,old_text,new_text);
  end loop;
end $$;

-- The legacy, positive-ID directory uses the same campaign-scoped projection.
grant execute on function private.activity_voter_history(uuid,bigint,uuid) to authenticated;
do $$
declare definition text; old_text text:='), ''[]''::jsonb)';
begin
 definition:=pg_get_functiondef('public.radar_authorized_voter_detail_v1(text,bigint)'::regprocedure);
 if (length(definition)-length(replace(definition,old_text,'')))/length(old_text)<>1 then
   raise exception 'Unexpected legacy detail definition';
 end if;
 execute replace(definition,old_text,old_text||' || private.activity_voter_history((select m.id from public.municipalities m where m.country_code=''GT'' and m.municipality_code=p_municipality_code),t.id,null::uuid)');
end $$;
