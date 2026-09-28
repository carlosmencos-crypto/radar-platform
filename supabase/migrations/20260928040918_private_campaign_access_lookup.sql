alter function public.radar_my_campaigns_v1() set schema private;
create function public.radar_my_campaigns_v1() returns jsonb language sql stable security invoker set search_path='' as $$ select private.radar_my_campaigns_v1(); $$;
revoke all on function public.radar_my_campaigns_v1() from public,anon;
grant execute on function public.radar_my_campaigns_v1() to authenticated;
