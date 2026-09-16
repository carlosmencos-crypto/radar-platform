import { useCallback, useEffect, useMemo, useState } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import {
  loadCampaignBundle,
  loadCampaignContacts,
  type CampaignContactRecord,
  type CampaignIdentityRecord,
} from "../data/radarRuntime";

export const V70_CAMPAIGN_UPDATED = "radar:v70-campaign-updated";

export const candidatePositions = [
  "Alcalde",
  "Síndico I",
  "Síndico II",
  "Síndico III",
  "Síndico suplente I",
  "Síndico suplente II",
  "Concejal I",
  "Concejal II",
  "Concejal III",
  "Concejal IV",
  "Concejal V",
  "Concejal VI",
  "Concejal VII",
  "Concejal VIII",
  "Concejal suplente I",
  "Concejal suplente II",
  "Concejal suplente III",
] as const;

export const canonicalSlate = [
  ["EC01", "Alcalde", "Candidato a alcalde", "ALCALDE"],
  ["EC02", "Síndico I", "Síndico I", "SÍNDICOS"],
  ["EC03", "Síndico II", "Síndico II", "SÍNDICOS"],
  ["EC04", "Síndico III", "Síndico III", "SÍNDICOS"],
  ["EC05", "Concejal I", "Concejal I", "CONCEJALES"],
  ["EC06", "Concejal II", "Concejal II", "CONCEJALES"],
  ["EC07", "Concejal III", "Concejal III", "CONCEJALES"],
  ["EC08", "Concejal IV", "Concejal IV", "CONCEJALES"],
  ["EC09", "Concejal V", "Concejal V", "CONCEJALES"],
  ["EC10", "Concejal VI", "Concejal VI", "CONCEJALES"],
  ["EC11", "Concejal VII", "Concejal VII", "CONCEJALES"],
  ["EC12", "Concejal VIII", "Concejal VIII", "CONCEJALES"],
] as const;

export type V70SlateMember = {
  code: string;
  positionKey: string;
  positionLabel: string;
  group: "ALCALDE" | "SÍNDICOS" | "CONCEJALES";
  contact: CampaignContactRecord | null;
  fullName: string;
  photoUrl: string;
};

export function announceV70CampaignUpdate() {
  window.dispatchEvent(new CustomEvent(V70_CAMPAIGN_UPDATED));
}

export function buildV70Slate(contacts: CampaignContactRecord[]): V70SlateMember[] {
  const candidates = contacts.filter(
    (person) => person.active && person.contact_type === "Candidato",
  );
  return canonicalSlate.map(([code, positionKey, positionLabel, group]) => {
    const contact =
      candidates.find((person) => person.candidate_position === positionKey) ??
      null;
    return {
      code,
      positionKey,
      positionLabel,
      group,
      contact,
      fullName: contact?.full_name || "Nombre Apellido",
      photoUrl: contact?.photo_url || "",
    };
  });
}

export function useV70CampaignBrand() {
  const { campaign_id } = useMunicipalityContext();
  const [contacts, setContacts] = useState<CampaignContactRecord[]>([]);
  const [identity, setIdentity] = useState<CampaignIdentityRecord>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!campaign_id) return;
    setLoading(true);
    try {
      const token = await ensureRadarAccessToken();
      const [bundle, people] = await Promise.all([
        loadCampaignBundle(campaign_id, token),
        loadCampaignContacts(campaign_id, token),
      ]);
      setIdentity(bundle.identity ?? {});
      setContacts((people ?? []).filter((person) => person.active));
    } finally {
      setLoading(false);
    }
  }, [campaign_id]);

  useEffect(() => {
    void load().catch(() => undefined);
  }, [load]);
  useEffect(() => {
    const reload = () => void load().catch(() => undefined);
    window.addEventListener(V70_CAMPAIGN_UPDATED, reload);
    return () => window.removeEventListener(V70_CAMPAIGN_UPDATED, reload);
  }, [load]);

  const slate = useMemo(() => buildV70Slate(contacts), [contacts]);
  const candidates = useMemo(
    () => contacts.filter((person) => person.contact_type === "Candidato"),
    [contacts],
  );
  const mayor = useMemo(
    () =>
      candidates.find((person) => person.candidate_position === "Alcalde") ??
      candidates[0] ??
      null,
    [candidates],
  );

  return {
    contacts,
    candidates,
    slate,
    mayor,
    identity,
    partyName: identity.party_name || "",
    partyLogoUrl: identity.party_logo_data_url || "",
    candidateName: mayor?.full_name || identity.candidate_name || "Nombre Apellido",
    candidatePhotoUrl: mayor?.photo_url || "",
    loading,
    load,
  };
}
