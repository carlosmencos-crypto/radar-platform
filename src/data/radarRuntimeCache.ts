import type { RadarRuntimeBundle } from "./radarRuntime";

const authorizedRuntimeByMunicipality = new Map<string, RadarRuntimeBundle>();

function assertRuntimeMunicipality(runtime: RadarRuntimeBundle) {
  const contextCode = runtime.context.municipality_code;
  const geoCode = runtime.geo.municipality.municipality_code;
  if (!/^\d{4}$/.test(contextCode) || contextCode !== geoCode) {
    throw new Error("El runtime autorizado no coincide con su geografía municipal.");
  }
  return contextCode;
}

export function installRadarRuntime(runtime: RadarRuntimeBundle) {
  const municipalityCode = assertRuntimeMunicipality(runtime);
  authorizedRuntimeByMunicipality.set(municipalityCode, runtime);
}

export function getInstalledRadarRuntime(municipalityCode?: string) {
  if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) return undefined;
  return authorizedRuntimeByMunicipality.get(municipalityCode);
}

export function clearInstalledRadarRuntime(municipalityCode?: string) {
  if (municipalityCode) {
    authorizedRuntimeByMunicipality.delete(municipalityCode);
    return;
  }
  authorizedRuntimeByMunicipality.clear();
}
