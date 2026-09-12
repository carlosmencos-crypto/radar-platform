import type { MunicipalityGeoBundle, RadarRuntimeBundle } from "./radarRuntime";

export const RADAR_PUBLIC_MAP_FEATURE_TYPES = [
  "populated_place",
  "tse_voting_center",
  "school",
  "health_facility",
] as const;

const GUATEMALA_MAP_BOUNDS = {
  south: 13.5,
  north: 18,
  west: -92.3,
  east: -88,
} as const;

const BBOX_TOLERANCE = 1e-8;

function featureKey(featureType: string, sourceKey: string) {
  return `${featureType}\u0000${sourceKey}`;
}

function withinTolerance(actual: number, expected: number) {
  return Math.abs(actual - expected) <= BBOX_TOLERANCE;
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

  let south = Number.POSITIVE_INFINITY;
  let north = Number.NEGATIVE_INFINITY;
  let west = Number.POSITIVE_INFINITY;
  let east = Number.NEGATIVE_INFINITY;

  for (const feature of bundle.features) {
    if (!allowedTypes.has(feature.feature_type)) {
      throw new Error("La geografía detallada devolvió una capa no autorizada para el mapa público.");
    }
    if (
      feature.latitude === null ||
      feature.longitude === null ||
      !Number.isFinite(feature.latitude) ||
      !Number.isFinite(feature.longitude) ||
      feature.latitude < GUATEMALA_MAP_BOUNDS.south ||
      feature.latitude > GUATEMALA_MAP_BOUNDS.north ||
      feature.longitude < GUATEMALA_MAP_BOUNDS.west ||
      feature.longitude > GUATEMALA_MAP_BOUNDS.east
    ) {
      throw new Error("La geografía detallada contiene coordenadas fuera del ámbito territorial de Guatemala.");
    }

    south = Math.min(south, feature.latitude);
    north = Math.max(north, feature.latitude);
    west = Math.min(west, feature.longitude);
    east = Math.max(east, feature.longitude);

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

  if (bundle.features.length > 0) {
    const bbox = runtime.geo.bbox;
    if (
      !bbox ||
      !Number.isFinite(bbox.south) ||
      !Number.isFinite(bbox.north) ||
      !Number.isFinite(bbox.west) ||
      !Number.isFinite(bbox.east) ||
      bbox.south > bbox.north ||
      bbox.west > bbox.east ||
      bbox.south < GUATEMALA_MAP_BOUNDS.south ||
      bbox.north > GUATEMALA_MAP_BOUNDS.north ||
      bbox.west < GUATEMALA_MAP_BOUNDS.west ||
      bbox.east > GUATEMALA_MAP_BOUNDS.east ||
      !withinTolerance(south, bbox.south) ||
      !withinTolerance(north, bbox.north) ||
      !withinTolerance(west, bbox.west) ||
      !withinTolerance(east, bbox.east)
    ) {
      throw new Error("La extensión territorial del mapa no reconcilia con la geografía autorizada.");
    }
  } else if (runtime.geo.bbox !== null) {
    throw new Error("El runtime reporta una extensión territorial sin features autorizados.");
  }
}
