import { findMunicipality } from "./municipalities";
import { findMunicipalProfile } from "./municipalProfiles";
import type { AvailabilityState, ConsumerModule, RadarMunicipalConsumer } from "../types/radar";

const publicModules = [
  ["demografia", "Demografía"], ["electoral", "Electoral"], ["territorio", "Territorio"],
  ["educacion", "Educación"], ["salud", "Salud"], ["finanzas_publicas", "Finanzas públicas"],
  ["obras", "Obras"], ["fuentes", "Fuentes y trazabilidad"],
] as const;

const campaignModules = [
  ["estrategia", "Estrategia"], ["directorio", "Directorio"], ["agenda", "Agenda"],
  ["mapa_operativo", "Mapa operativo"], ["dia_d", "Día D"], ["recursos", "Recursos"],
  ["ia_radar", "IA RADAR"], ["configuracion", "Configuración"], ["identidad", "Identidad de campaña"],
] as const;

function publicState(code: string, id: string): AvailabilityState {
  const profile = findMunicipalProfile(code);
  const profileId = id === "finanzas_publicas" ? "finanzas" : id;
  const module = profile?.modules.find((item) => item.id === profileId);
  if (module) {
    return module.status === "validated" ? "disponible" : module.status === "partial" ? "parcial" : "pendiente";
  }
  if (id === "fuentes") return "disponible";
  if (id === "territorio" || id === "electoral") return "parcial";
  return "pendiente";
}

export function resolveRadarConsumer(municipalityCode?: string): RadarMunicipalConsumer | undefined {
  const municipality = findMunicipality(municipalityCode);
  if (!municipality) return undefined;

  const modules: ConsumerModule[] = [
    ...publicModules.map(([id, label]) => ({ id, label, state: publicState(municipality.code, id), vault: "data" as const, source: "RADAR Data Vault" })),
    ...campaignModules.map(([id, label]) => ({ id, label, state: "no_publicado" as const, vault: "campaign" as const })),
  ];

  return {
    context: { municipality_code: municipality.code, campaign_id: "public-demo", user_role: "public_viewer", permissions: ["data_vault:read_public"] },
    municipality,
    modules,
  };
}
