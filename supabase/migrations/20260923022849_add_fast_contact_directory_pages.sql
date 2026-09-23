-- Fetch one page plus a sentinel. Exact filtered counts remain available on request.
create function private.radar_authorized_contact_directory_page_v1(
  p_municipality_code text, p_query text default null, p_dpi text default null,
  p_community text default null, p_age_min integer default null, p_age_max integer default null,
  p_status text default null, p_affiliation text default null, p_role text default null,
  p_responsible uuid default null, p_offset integer default 0, p_limit integer default 25
) returns jsonb language plpgsql stable security definer set search_path = '' set work_mem='32MB' as $$
declare
  muni uuid; source uuid; total bigint; items jsonb; filtered boolean; page_limit integer := least(greatest(coalesce(p_limit,25),1),50); has_more boolean;
begin
  select m.id into muni from public.municipalities m where m.country_code='GT'
    and m.municipality_code=p_municipality_code;
  if muni is null or not private.can_read_national_register(muni) then
    raise exception 'Municipality not authorized' using errcode='42501';
  end if;
  select s.source_id,s.total_count into source,total
    from campaign_vault.national_register_municipal_stats s
    join campaign_vault.national_register_sources r on r.id=s.source_id and r.active
    where s.municipality_id=muni;
  if source is null then raise exception 'Municipal source is not active'; end if;
  filtered := nullif(btrim(p_query),'') is not null or nullif(p_dpi,'') is not null
    or nullif(p_community,'') is not null or p_age_min is not null or p_age_max is not null or nullif(p_status,'') is not null
    or nullif(p_affiliation,'') is not null or nullif(p_role,'') is not null or p_responsible is not null;
  if filtered then total:=null; end if;
  select coalesce(jsonb_agg(to_jsonb(page) order by page.id desc),'[]'::jsonb) into items from (
    select -r.id as id,r.full_name,r.community,
      case when r.age_base between 18 and 110 then r.age_base+3 end as estimated_age_2026,
      repeat('•',9)||right(r.identification,4) as masked_identification,
      coalesce(cp.profile->>'contact_status','SIN_CONTACTO') as contact_status,cp.profile->>'phone_primary' as phone_primary,
      cp.profile->>'assigned_person_name' as assigned_person_name,cp.profile->>'campaign_role' as campaign_role,
      cp.profile->>'party_affiliation' as party_affiliation,
      p_municipality_code as municipality_code,total as total_count
    from campaign_vault.national_register_2023 r
    left join campaign_vault.contact_workspace_profiles cp on cp.owner_id=(select auth.uid())
      and cp.source_id=r.source_id and cp.record_id=r.id and cp.municipality_id=muni
    where r.source_id=source and r.municipality_id=muni
      and (nullif(btrim(p_query),'') is null or lower(r.full_name) like '%'||lower(btrim(p_query))||'%')
      and (nullif(p_dpi,'') is null or r.identification=regexp_replace(p_dpi,'[^0-9]','','g'))
      and (nullif(p_community,'') is null or r.community=p_community)
      and (p_age_min is null or (r.age_base between 18 and 110 and r.age_base+3>=p_age_min))
      and (p_age_max is null or (r.age_base between 18 and 110 and r.age_base+3<=p_age_max))
      and (nullif(p_status,'') is null or coalesce(cp.profile->>'contact_status','SIN_CONTACTO')=p_status)
      and (nullif(p_affiliation,'') is null or cp.profile->>'party_affiliation'=p_affiliation)
      and (nullif(p_role,'') is null or cp.profile->>'campaign_role'=p_role)
      and p_responsible is null
    order by r.id offset greatest(coalesce(p_offset,0),0) limit page_limit+1
  ) page;
  has_more := jsonb_array_length(items)>page_limit;
  if has_more then items:=items-page_limit; end if;
  if filtered and not has_more and (jsonb_array_length(items)>0 or coalesce(p_offset,0)=0) then
    total:=greatest(coalesce(p_offset,0),0)+jsonb_array_length(items);
  end if;
  return jsonb_build_object('has_more',has_more,'municipality_code',p_municipality_code,'items',items,
    'total_count',total,'source_year',2023);
end;
$$;


create function public.radar_authorized_contact_directory_page_v1(
  p_municipality_code text, p_query text default null, p_dpi text default null,
  p_community text default null, p_age_min integer default null, p_age_max integer default null,
  p_status text default null, p_affiliation text default null, p_role text default null,
  p_responsible uuid default null, p_offset integer default 0, p_limit integer default 25
) returns jsonb language sql stable security invoker set search_path='' as $$
  select private.radar_authorized_contact_directory_page_v1(p_municipality_code,p_query,p_dpi,
    p_community,p_age_min,p_age_max,p_status,p_affiliation,p_role,p_responsible,p_offset,p_limit);
$$;
revoke all on function private.radar_authorized_contact_directory_page_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_contact_directory_page_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) from public,anon;
grant execute on function private.radar_authorized_contact_directory_page_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_contact_directory_page_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) to authenticated;
