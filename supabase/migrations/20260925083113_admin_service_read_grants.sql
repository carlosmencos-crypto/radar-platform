-- Internal Edge service reads; client grants and RLS remain unchanged.
grant select on public.campaign_members, public.campaigns, public.municipalities to service_role;
