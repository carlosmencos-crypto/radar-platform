-- Regression: exercise the Edge database role, not the owner role.
begin;
set local role service_role;
select campaign_id,user_id,member_role,created_at from public.campaign_members order by campaign_id,user_id limit 1;
select id,is_demo,municipality_id from public.campaigns limit 1;
select id,municipality_code from public.municipalities limit 1;
rollback;
