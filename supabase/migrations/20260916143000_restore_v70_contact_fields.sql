-- Preserve the V70 CRM contact fields required by Agenda, Día D and carnets.
alter table campaign_vault.contacts
  add column if not exists phone_secondary text,
  add column if not exists candidate_position text;

create or replace function public.radar_save_campaign_contact_v1(
  p_campaign_id uuid,
  p_contact_id uuid,
  p_contact jsonb
)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public, private, campaign_vault, pg_temp
as $$
declare
  saved campaign_vault.contacts;
  name_value text := nullif(btrim(p_contact->>'full_name'), '');
begin
  if not private.is_campaign_member(p_campaign_id, array['campaign_admin','campaign_editor']) then
    raise exception 'campaign access denied' using errcode='42501';
  end if;
  if name_value is null then raise exception 'contact name required' using errcode='22023'; end if;

  if p_contact_id is null then
    insert into campaign_vault.contacts (
      campaign_id, full_name, phone, phone_secondary, community, address_text, status, notes,
      email, role, contact_type, candidate_position, active, photo_url, identification,
      social_url, file_code, is_in_crm, created_by
    ) values (
      p_campaign_id, name_value, nullif(btrim(p_contact->>'phone'), ''),
      nullif(btrim(p_contact->>'phone_secondary'), ''), nullif(btrim(p_contact->>'community'), ''),
      nullif(btrim(p_contact->>'address_text'), ''), coalesce(nullif(btrim(p_contact->>'status'), ''), 'base'),
      nullif(btrim(p_contact->>'notes'), ''), nullif(btrim(p_contact->>'email'), ''),
      nullif(btrim(p_contact->>'role'), ''), coalesce(nullif(btrim(p_contact->>'contact_type'), ''), 'CONTACTO'),
      nullif(btrim(p_contact->>'candidate_position'), ''), coalesce((p_contact->>'active')::boolean, true),
      nullif(btrim(p_contact->>'photo_url'), ''), nullif(btrim(p_contact->>'identification'), ''),
      nullif(btrim(p_contact->>'social_url'), ''), nullif(btrim(p_contact->>'file_code'), ''),
      coalesce((p_contact->>'is_in_crm')::boolean, true), auth.uid()
    ) returning * into saved;
  else
    update campaign_vault.contacts set
      full_name=name_value,
      phone=nullif(btrim(p_contact->>'phone'), ''),
      phone_secondary=nullif(btrim(p_contact->>'phone_secondary'), ''),
      community=nullif(btrim(p_contact->>'community'), ''),
      address_text=nullif(btrim(p_contact->>'address_text'), ''),
      status=coalesce(nullif(btrim(p_contact->>'status'), ''), status),
      notes=nullif(btrim(p_contact->>'notes'), ''),
      email=nullif(btrim(p_contact->>'email'), ''),
      role=nullif(btrim(p_contact->>'role'), ''),
      contact_type=coalesce(nullif(btrim(p_contact->>'contact_type'), ''), contact_type),
      candidate_position=nullif(btrim(p_contact->>'candidate_position'), ''),
      active=coalesce((p_contact->>'active')::boolean, active),
      photo_url=nullif(btrim(p_contact->>'photo_url'), ''),
      identification=nullif(btrim(p_contact->>'identification'), ''),
      social_url=nullif(btrim(p_contact->>'social_url'), ''),
      file_code=nullif(btrim(p_contact->>'file_code'), ''),
      is_in_crm=coalesce((p_contact->>'is_in_crm')::boolean, is_in_crm),
      updated_at=now()
    where id=p_contact_id and campaign_id=p_campaign_id
    returning * into saved;
    if saved.id is null then raise exception 'contact not found' using errcode='P0002'; end if;
  end if;
  return to_jsonb(saved) - 'created_by';
end
$$;

revoke all on function public.radar_save_campaign_contact_v1(uuid,uuid,jsonb) from public, anon;
grant execute on function public.radar_save_campaign_contact_v1(uuid,uuid,jsonb) to authenticated;
