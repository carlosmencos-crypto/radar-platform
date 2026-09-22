-- Keep privileged readers outside the exposed API schema. Every private reader
-- still checks the authenticated actor, municipal scope and source activation.
alter function public.radar_authorized_nominal_availability_v1(text) set schema private;
alter function public.radar_authorized_nominal_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer) set schema private;
alter function public.radar_authorized_nominal_detail_v1(text,bigint) set schema private;
alter function public.radar_reveal_nominal_identification_v1(text,bigint) set schema private;

create function public.radar_authorized_nominal_availability_v1(p_municipality_code text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.radar_authorized_nominal_availability_v1(p_municipality_code);
$$;
create function public.radar_authorized_nominal_directory_v1(
  p_municipality_code text, p_query text default null, p_dpi text default null,
  p_community text default null, p_age_min integer default null, p_age_max integer default null,
  p_status text default null, p_affiliation text default null, p_role text default null,
  p_responsible uuid default null, p_offset integer default 0, p_limit integer default 25
) returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.radar_authorized_nominal_directory_v1(p_municipality_code,p_query,p_dpi,
    p_community,p_age_min,p_age_max,p_status,p_affiliation,p_role,p_responsible,p_offset,p_limit);
$$;
create function public.radar_authorized_nominal_detail_v1(p_municipality_code text,p_voter_id bigint)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select private.radar_authorized_nominal_detail_v1(p_municipality_code,p_voter_id);
$$;
create function public.radar_reveal_nominal_identification_v1(p_municipality_code text,p_voter_id bigint)
returns text language sql volatile security invoker set search_path = '' as $$
  select private.radar_reveal_nominal_identification_v1(p_municipality_code,p_voter_id);
$$;
revoke all on function public.radar_authorized_nominal_availability_v1(text),
  public.radar_authorized_nominal_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_nominal_detail_v1(text,bigint),
  public.radar_reveal_nominal_identification_v1(text,bigint) from public,anon;
grant execute on function public.radar_authorized_nominal_availability_v1(text),
  public.radar_authorized_nominal_directory_v1(text,text,text,text,integer,integer,text,text,text,uuid,integer,integer),
  public.radar_authorized_nominal_detail_v1(text,bigint),
  public.radar_reveal_nominal_identification_v1(text,bigint) to authenticated;
