import { resolveRadarConsumer } from "./radarConsumer";
import { loadRadarRuntimeBundle, type RadarRuntimeBundle } from "./radarRuntime";
import type { RadarMunicipalConsumer } from "../types/radar";

export interface AuthorizedConsumerContext {
  municipality_code: string;
  campaign_id: string | null;
  user_role: string;
  permissions: string[];
}

export interface AuthorizedRadarConsumer extends Omit<RadarMunicipalConsumer, "context"> {
  context: AuthorizedConsumerContext;
  runtime: RadarRuntimeBundle;
}

function assertRuntimeMatchesCanonicalConsumer(base: RadarMunicipalConsumer, runtime: RadarRuntimeBundle) {
  if (runtime.context.municipality_code !== base.municipality.code) {
    throw new Error("El contexto autorizado no corresponde al municipio solicitado.");
  }

  if (runtime.geo.municipality.municipality_code !== base.municipality.code) {
    throw new Error("La geografía autorizada no corresponde al municipio solicitado.");
  }

  const canonicalVisibleLayers = base.modules
    .filter((module) => module.frontend_action !== "HIDE_POST_LAUNCH")
    .map((module) => module.layer_id);
  const canonicalVisibleSet = new Set(canonicalVisibleLayers);
  const runtimeLayerIds = runtime.layers.map((layer) => layer.layer_id);
  const runtimeLayerSet = new Set(runtimeLayerIds);

  if (runtimeLayerIds.length !== runtimeLayerSet.size) {
    throw new Error("El runtime autorizado devolvió capas duplicadas.");
  }

  const unexpectedLayers = runtimeLayerIds.filter((layerId) => !canonicalVisibleSet.has(layerId as never));
  const missingLayers = canonicalVisibleLayers.filter((layerId) => !runtimeLayerSet.has(layerId));
  if (unexpectedLayers.length || missingLayers.length) {
    throw new Error("El runtime autorizado no cumple el contrato visible 340×17.");
  }
}

export async function resolveAuthorizedRadarConsumer(
  municipalityCode: string,
  accessToken: string,
): Promise<AuthorizedRadarConsumer> {
  const base = resolveRadarConsumer(municipalityCode);
  if (!base) throw new Error("Municipio fuera del contrato canónico RADAR 340.");

  const runtime = await loadRadarRuntimeBundle(base.municipality.code, accessToken);
  assertRuntimeMatchesCanonicalConsumer(base, runtime);

  return {
    ...base,
    context: {
      municipality_code: runtime.context.municipality_code,
      campaign_id: runtime.context.campaign_id,
      user_role: runtime.context.user_role,
      permissions: [...runtime.context.permissions],
    },
    runtime,
  };
}
