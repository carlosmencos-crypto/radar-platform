import type { MunicipalityGeoBundle, RadarRuntimeBundle } from "./radarRuntime";

export const RADAR_PUBLIC_MAP_FEATURE_TYPES = [
  "populated_place",
  "tse_voting_center",
  "school",
  "health_facility",
] as const;

function featureKey(featureType: string, sourceKey: string) {
  return `${featureType}\u0000${sourceKey}`;
}

export function assertGeoBundleMatchesRuntime(runtime: RadarRuntimeBundle, bundle: MunicipalityGeoBundle) {
  const municipalityCode = runtime.context.municipality_code;
  if (
    bundle.municipality?.municipality_code !== municipalityCode ||
    runtime.geo.municipality.municipality_code !== municipalityCode
  ) {
    throw new Error("La geografía detallada no corresponde al municipio autorizado.");
  }

  const allowedTypes = new Set<string>(RADAR_PUBLIC_MAP_FEATURE_TYPES);
  const actualCounts = new Map<string, number>();
  const keys = new Set<string>();

  for (const feature of bundle.features) {
    if (!allowedTypes.has(feature.feature_type)) {
      throw new Error("La geografía detallada devolvió una capa no autorizada para el mapa público.");
    }
    if (
      feature.latitude === null ||
      feature.longitude === null ||
      !Number.isFinite(feature.latitude) ||
      !Number.isFinite(feature.longitude) ||
      feature.latitude < -90 || feature.latitude > 90 ||
      feature.longitude < -180 || feature.longitude > 180
    ) {
      throw new Error("La geografía detallada contiene coordenadas inválidas.");
    }

    const key = featureKey(feature.feature_type, feature.source_key);
    if (keys.has(key)) throw new Error("La geografía detallada contiene features duplicados.");
    keys.add(key);
    actualCounts.set(feature.feature_type, (actualCounts.get(feature.feature_type) ?? 0) + 1);
  }

  for (const featureType of RADAR_PUBLIC_MAP_FEATURE_TYPES) {
    const actual = actualCounts.get(featureType) ?? 0;
    const bundleCount = bundle.feature_counts[featureType] ?? 0;
    const runtimeCount = runtime.geo.feature_counts[featureType] ?? 0;
    if (actual !== bundleCount || actual !== runtimeCount) {
      throw new Error("La geografía detallada no reconcilia con el resumen autorizado del municipio.");
    }
  }

  if (bundle.features.length !== runtime.geo.feature_total) {
    throw new Error("El total geográfico detallado no reconcilia con el runtime autorizado.");
  }
}
