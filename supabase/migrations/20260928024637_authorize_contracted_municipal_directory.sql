create or replace function private.can_read_national_register(p_municipality_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
select (select auth.uid()) is not null and (
(exists(select 1 from public.profiles p where p.user_id=(select auth.uid()) and p.is_active and p.platform_role='platform_admin') and private.can_read_data_vault('GT',p_municipality_id))
or exists(select 1 from public.campaigns c where c.municipality_id=p_municipality_id and c.status='active' and not c.is_demo
and private.is_campaign_member(c.id,array['campaign_admin','campaign_editor','campaign_viewer'])
and exists(select 1 from admin_vault.commercial_contracts cc where cc.campaign_id=c.id and cc.status='ACTIVE' and cc.contract_period @> current_date))
);
$$;
revoke all on function private.can_read_national_register(uuid) from public,anon;
