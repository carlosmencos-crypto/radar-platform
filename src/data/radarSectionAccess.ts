export type RadarRuntimeSection =
  | "inicio"
  | "inteligencia"
  | "estrategia"
  | "directorio"
  | "agenda"
  | "mapa"
  | "dia-d"
  | "recursos"
  | "pulso"
  | "ia-radar"
  | "configuracion";

export interface RadarSectionAccessContext {
  campaignId: string;
  userRole: string;
  permissions: string[];
}

const campaignSections = new Set<RadarRuntimeSection>([
  "estrategia",
  "directorio",
  "agenda",
  "dia-d",
  "recursos",
]);

const dataSections = new Set<RadarRuntimeSection>([
  "inicio",
  "inteligencia",
  "mapa",
  "ia-radar",
]);

export function canViewRadarSection(
  section: RadarRuntimeSection,
  context: RadarSectionAccessContext,
) {
  const permissionSet = new Set(context.permissions);
  const isPlatformAdmin =
    context.userRole === "national_admin" ||
    context.userRole === "platform_admin" ||
    permissionSet.has("admin:access");

  if (dataSections.has(section)) {
    return (
      permissionSet.has("data_vault:read") ||
      permissionSet.has("data_vault:read_public") ||
      isPlatformAdmin
    );
  }

  if (campaignSections.has(section)) {
    return Boolean(context.campaignId) && permissionSet.has("campaign_vault:read");
  }

  if (section === "pulso") {
    return Boolean(context.campaignId) && permissionSet.has("pulse:read");
  }

  if (section === "configuracion") {
    return isPlatformAdmin || Boolean(context.campaignId);
  }

  return false;
}
