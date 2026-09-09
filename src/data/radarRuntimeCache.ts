import type { MunicipalityGeoBundle, RadarRuntimeBundle } from "./radarRuntime";

const authorizedRuntimeByMunicipality = new Map<string, RadarRuntimeBundle>();
const authorizedGeoByMunicipality = new Map<string, MunicipalityGeoBundle>();

function assertRuntimeMunicipality(runtime: RadarRuntimeBundle) {
  const contextCode = runtime.context.municipality_code;
  const geoCode = runtime.geo.municipality.municipality_code;
  if (!/^\d{4}$/.test(contextCode) || contextCode !== geoCode) {
    throw new Error("El runtime autorizado no coincide con su geografía municipal.");
  }
  return contextCode;
}

function assertGeoBundleMunicipality(bundle: MunicipalityGeoBundle) {
  const municipalityCode = bundle.municipality?.municipality_code;
  if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) {
    throw new Error("El bundle geográfico autorizado no tiene municipio válido.");
  }
  return municipalityCode;
}

export function installRadarRuntime(runtime: RadarRuntimeBundle) {
  const municipalityCode = assertRuntimeMunicipality(runtime);
  authorizedRuntimeByMunicipality.set(municipalityCode, runtime);
}

export function getInstalledRadarRuntime(municipalityCode?: string) {
  if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) return undefined;
  return authorizedRuntimeByMunicipality.get(municipalityCode);
}

export function installRadarGeoBundle(bundle: MunicipalityGeoBundle) {
  const municipalityCode = assertGeoBundleMunicipality(bundle);
  authorizedGeoByMunicipality.set(municipalityCode, bundle);
}

export function getInstalledRadarGeoBundle(municipalityCode?: string) {
  if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) return undefined;
  return authorizedGeoByMunicipality.get(municipalityCode);
}

export function clearInstalledRadarRuntime(municipalityCode?: string) {
  if (municipalityCode) {
    authorizedRuntimeByMunicipality.delete(municipalityCode);
    return;
  }
  authorizedRuntimeByMunicipality.clear();
}

export function clearInstalledRadarGeoBundle(municipalityCode?: string) {
  if (municipalityCode) {
    authorizedGeoByMunicipality.delete(municipalityCode);
    return;
  }
  authorizedGeoByMunicipality.clear();
}
