import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import {
  getInstalledRadarElectoralLayers,
  getInstalledRadarGeoBundle,
  getInstalledRadarRuntime,
  getInstalledRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import {
  adaptAuthorizedElectoralTerritoryLayers,
  type V70ElectoralCenter,
} from "../data/v70ElectoralAdapter";
import type {
  AuthorizedVoterCommunity,
  CampaignActivityRecord,
  GeoFeatureRecord,
} from "../data/radarRuntime";
import { loadCampaignBundle } from "../data/radarRuntime";

type LatLng = [number, number];
type LeafletLayer = { remove(): void };
type LeafletMarker = LeafletLayer & {
  addTo(map: LeafletMap): LeafletMarker;
  bindTooltip(html: string): LeafletMarker;
  on(event: "click", handler: () => void): LeafletMarker;
};
type LeafletPolyline = LeafletLayer & {
  addTo(map: LeafletMap): LeafletPolyline;
  bindTooltip(html: string): LeafletPolyline;
  on(event: "click", handler: () => void): LeafletPolyline;
};
type LeafletCircle = LeafletLayer & {
  addTo(map: LeafletMap): LeafletCircle;
  bindTooltip(html: string): LeafletCircle;
  on(event: "click", handler: () => void): LeafletCircle;
};
type LeafletBounds = {
  extend(point: LatLng): LeafletBounds;
  isValid(): boolean;
};
type LeafletMap = {
  fitBounds(
    bounds: LeafletBounds,
    options: { padding: [number, number]; maxZoom?: number },
  ): LeafletMap;
  setView(point: LatLng, zoom: number): LeafletMap;
  flyTo(point: LatLng, zoom: number, options: { duration: number }): LeafletMap;
  invalidateSize(): LeafletMap;
  remove(): void;
  on(
    event: "click",
    handler: (event: { latlng: { lat: number; lng: number } }) => void,
  ): LeafletMap;
};
type LeafletNamespace = {
  map(
    node: HTMLElement,
    options: {
      zoomControl: boolean;
      attributionControl: boolean;
      preferCanvas: boolean;
    },
  ): LeafletMap;
  control: {
    zoom(options: { position: "bottomright" }): {
      addTo(map: LeafletMap): unknown;
    };
  };
  tileLayer(
    url: string,
    options: { maxZoom: number; attribution: string },
  ): LeafletLayer & { addTo(map: LeafletMap): LeafletLayer };
  latLngBounds(points: LatLng[]): LeafletBounds;
  divIcon(options: {
    className: string;
    html: string;
    iconSize: [number, number];
    iconAnchor: [number, number];
  }): unknown;
  marker(
    point: LatLng,
    options: { icon: unknown },
  ): LeafletMarker;
  circleMarker(
    point: LatLng,
    options: {
      radius: number;
      color: string;
      weight: number;
      fillColor: string;
      fillOpacity: number;
    },
  ): LeafletMarker;
  circle(
    point: LatLng,
    options: {
      radius: number;
      color: string;
      weight: number;
      fillColor: string;
      fillOpacity: number;
      dashArray?: string;
    },
  ): LeafletCircle;
  polyline(
    points: LatLng[],
    options: { color: string; weight: number; opacity: number; dashArray?: string },
  ): LeafletPolyline;
};
type LeafletWindow = Window & {
  L?: LeafletNamespace;
  __radarLeafletPromise?: Promise<LeafletNamespace>;
};

type LayerKey = "concentracion" | "prioridades" | "centros" | "agenda";
type CommunityPoint = AuthorizedVoterCommunity & {
  lat: number;
  lon: number;
  precision: string;
};
type TerritorySuggestion = {
  key: string;
  name: string;
  category: string;
  detail: string;
  lat: number;
  lon: number;
};
type ExternalPlace = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  addresstype?: string;
  name?: string;
};
type ActivityPoint = { lat: number; lon: number; label: string };

function distanceKm(a: LatLng, b: LatLng) {
  return Math.hypot((a[0] - b[0]) * 111, (a[1] - b[1]) * 108);
}

const fmt = new Intl.NumberFormat("es-GT");
const mapActivityTypes = [
  "VISITA",
  "REUNION",
  "MITIN",
  "CAMINATA",
  "EVENTO",
  "RECORRIDO",
  "CAPACITACION",
  "OTRA",
] as const;
const mapActivityLabels: Record<string, string> = {
  VISITA: "Visitas",
  REUNION: "Reuniones",
  MITIN: "Mitines",
  CAMINATA: "Caminatas / caravanas",
  EVENTO: "Eventos",
  RECORRIDO: "Recorridos",
  CAPACITACION: "Capacitaciones",
  OTRA: "Otras",
};
const mapActivityColors: Record<string, string> = {
  VISITA: "#D69070",
  REUNION: "#5A2973",
  MITIN: "#b84e3e",
  CAMINATA: "#20a286",
  EVENTO: "#09566C",
  RECORRIDO: "#8b5cf6",
  CAPACITACION: "#7f8c83",
  OTRA: "#2F343A",
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
function clean(value: string) {
  return value.replace(/[<>&]/g, "");
}
function featureCategory(featureType: string) {
  return featureType
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function ensureLeaflet() {
  const target = window as LeafletWindow;
  if (target.L) return Promise.resolve(target.L);
  if (target.__radarLeafletPromise) return target.__radarLeafletPromise;
  if (!document.getElementById("radar-leaflet-css")) {
    const link = document.createElement("link");
    link.id = "radar-leaflet-css";
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    document.head.appendChild(link);
  }
  target.__radarLeafletPromise = new Promise<LeafletNamespace>(
    (resolve, reject) => {
      const finish = () =>
        target.L
          ? resolve(target.L)
          : reject(new Error("Leaflet did not initialize"));
      const existing = document.getElementById(
        "radar-leaflet-js",
      ) as HTMLScriptElement | null;
      if (existing) {
        existing.addEventListener("load", finish, { once: true });
        existing.addEventListener(
          "error",
          () => reject(new Error("Leaflet failed to load")),
          { once: true },
        );
        return;
      }
      const script = document.createElement("script");
      script.id = "radar-leaflet-js";
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.addEventListener("load", finish, { once: true });
      script.addEventListener(
        "error",
        () => reject(new Error("Leaflet failed to load")),
        { once: true },
      );
      document.head.appendChild(script);
    },
  );
  return target.__radarLeafletPromise;
}

function pointFromFeature(feature: GeoFeatureRecord | undefined) {
  if (!feature || feature.latitude === null || feature.longitude === null)
    return null;
  return { lat: feature.latitude, lon: feature.longitude };
}

function communityPoint(
  community: AuthorizedVoterCommunity,
  features: GeoFeatureRecord[],
  centers: V70ElectoralCenter[],
  fallback: LatLng | null,
) {
  const target = normalize(community.community_label);
  const exact = features.find(
    (feature) =>
      feature.latitude !== null &&
      feature.longitude !== null &&
      normalize(feature.feature_name ?? "") === target,
  );
  const cabecera =
    !exact && target === "cabecera municipal"
      ? features.find(
          (feature) =>
            feature.feature_type === "populated_place" &&
            feature.latitude !== null &&
            feature.longitude !== null &&
            feature.source_key.endsWith("001"),
        )
      : undefined;
  const partial =
    exact ??
    cabecera ??
    features.find((feature) => {
      if (feature.latitude === null || feature.longitude === null) return false;
      const name = normalize(feature.feature_name ?? "");
      return (
        target.length >= 5 &&
        name.length >= 5 &&
        (name.includes(target) || target.includes(name))
      );
    });
  const featurePoint = pointFromFeature(partial);
  if (featurePoint)
    return {
      ...community,
      ...featurePoint,
      precision: exact
        ? "Comunidad georreferenciada"
        : cabecera
          ? "Cabecera municipal georreferenciada"
          : "Referencia oficial relacionada",
    };
  const center = centers.find((item) => {
    const haystack = normalize(`${item.community} ${item.name}`);
    return (
      target.length >= 5 &&
      (haystack.includes(target) || target.includes(normalize(item.community)))
    );
  });
  if (center && center.lat !== null && center.lon !== null)
    return {
      ...community,
      lat: center.lat,
      lon: center.lon,
      precision: `Referencia territorial TSE · ${center.community}`,
    };
  if (!fallback) return null;
  return {
    ...community,
    lat: fallback[0],
    lon: fallback[1],
    precision: "Referencia territorial aproximada dentro del municipio",
  };
}

export function V70OperationalMap() {
  const { campaign_id, municipality_code, municipality_name } = useMunicipalityContext();
  const runtime = getInstalledRadarRuntime(municipality_code);
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);
  const voterCommunities =
    getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const electoralLayers =
    getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const electoral = useMemo(() => {
    try {
      return electoralLayers.length
        ? adaptAuthorizedElectoralTerritoryLayers(electoralLayers)
        : null;
    } catch {
      return null;
    }
  }, [electoralLayers]);
  const centers = electoral?.centers ?? [];

  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<LeafletLayer | null>(null);
  const drawnRef = useRef<LeafletLayer[]>([]);
  const createModeRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    concentracion: true,
    prioridades: false,
    centros: false,
    agenda: true,
  });
  const [activityTypes, setActivityTypes] = useState<string[]>([
    ...mapActivityTypes,
  ]);
  const [showRoutes, setShowRoutes] = useState(true);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateWindow, setDateWindow] = useState("mes");
  const [statusFilter, setStatusFilter] = useState("TODOS");
  const [responsibleFilter, setResponsibleFilter] = useState("TODOS");
  const [createMode, setCreateMode] = useState(false);
  const [selectedCommunity, setSelectedCommunity] =
    useState<CommunityPoint | null>(null);
  const [selectedPlace, setSelectedPlace] =
    useState<TerritorySuggestion | null>(null);
  const [externalPlaces, setExternalPlaces] = useState<ExternalPlace[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);
  const [activityPoint, setActivityPoint] = useState<ActivityPoint | null>(null);
  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [selectedActivity, setSelectedActivity] = useState<CampaignActivityRecord | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!campaign_id) return;
    void ensureRadarAccessToken()
      .then((token) => loadCampaignBundle(campaign_id, token))
      .then((bundle) => { if (!cancelled) setActivities(bundle.activities); })
      .catch(() => { if (!cancelled) setActivities([]); });
    return () => { cancelled = true; };
  }, [campaign_id]);

  useEffect(() => {
    createModeRef.current = createMode;
  }, [createMode]);

  const mappedCommunities = useMemo(
    () =>
      voterCommunities
        .map((item, index) => {
          const bbox = runtime?.geo.bbox;
          const fallback = bbox
            ? ([
                bbox.south + (bbox.north - bbox.south) * (0.18 + ((index * 37) % 61) / 100),
                bbox.west + (bbox.east - bbox.west) * (0.16 + ((index * 53) % 67) / 100),
              ] as LatLng)
            : null;
          return communityPoint(item, geoBundle?.features ?? [], centers, fallback);
        })
        .filter((item): item is CommunityPoint => Boolean(item)),
    [voterCommunities, geoBundle, centers, runtime?.geo.bbox],
  );
  const topCommunities = useMemo(
    () =>
      [...mappedCommunities].sort(
        (a, b) => b.elector_count - a.elector_count,
      ),
    [mappedCommunities],
  );
  const searchSuggestions = useMemo(() => {
    const term = normalize(query);
    if (term.length < 2) return [];
    return mappedCommunities
      .filter((item) => normalize(item.community_label).includes(term))
      .slice(0, 7);
  }, [mappedCommunities, query]);
  const territorySuggestions = useMemo(() => {
    const term = normalize(query);
    if (term.length < 2) return [];
    const features: TerritorySuggestion[] = (geoBundle?.features ?? []).flatMap(
      (feature) => {
        if (
          feature.latitude === null ||
          feature.longitude === null ||
          !feature.feature_name
        )
          return [];
        const haystack = normalize(
          `${feature.feature_name} ${feature.feature_type} ${JSON.stringify(feature.properties ?? {})}`,
        );
        if (!haystack.includes(term)) return [];
        return [
          {
            key: `feature-${feature.source_key}`,
            name: feature.feature_name,
            category: featureCategory(feature.feature_type),
            detail: feature.source_label || "Territorio autorizado de RADAR",
            lat: feature.latitude,
            lon: feature.longitude,
          },
        ];
      },
    );
    const votingCenters: TerritorySuggestion[] = centers.flatMap((center) => {
      if (
        center.lat === null ||
        center.lon === null ||
        !normalize(`${center.name} ${center.community}`).includes(term)
      )
        return [];
      return [
        {
          key: `center-${center.id}`,
          name: center.name,
          category: "Centro de votación",
          detail: center.community,
          lat: center.lat,
          lon: center.lon,
        },
      ];
    });
    const seen = new Set<string>();
    return [...features, ...votingCenters]
      .filter((item) => {
        const key = `${normalize(item.name)}:${item.lat.toFixed(5)}:${item.lon.toFixed(5)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 7);
  }, [centers, geoBundle?.features, query]);
  const visibleCommunityList = useMemo(() => {
    const term = normalize(query);
    if (!term) return topCommunities;
    return mappedCommunities
      .filter((item) => normalize(item.community_label).includes(term))
      .slice(0, 20);
  }, [mappedCommunities, query, topCommunities]);
  const priorityCenters = useMemo(
    () =>
      [...centers]
        .sort((a, b) => (b.voters ?? 0) - (a.voters ?? 0))
        .slice(0, 5),
    [centers],
  );
  const visibleActivities = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = today.getTime();
    const horizon = dateWindow === "hoy" ? 1 : dateWindow === "semana" ? 7 : dateWindow === "mes" ? 30 : null;
    return activities.filter((activity) => {
      if (activity.latitude === null || activity.longitude === null) return false;
      if (activity.status.toUpperCase() === "CANCELADA") return false;
      if (statusFilter !== "TODOS" && activity.status.toUpperCase() !== statusFilter) return false;
      const responsible = String(activity.details?.responsible || "");
      if (responsibleFilter !== "TODOS" && responsible !== responsibleFilter) return false;
      if (!activityTypes.includes(activity.activity_type || "OTRA")) return false;
      if (!horizon || !activity.starts_at) return true;
      const when = new Date(activity.starts_at).getTime();
      return when >= start && when < start + horizon * 86400000;
    });
  }, [activities, activityTypes, dateWindow, responsibleFilter, statusFilter]);
  const activityResponsibles = useMemo(
    () => [...new Set(activities.map((activity) => String(activity.details?.responsible || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "es")),
    [activities],
  );

  useEffect(() => {
    const term = query.trim();
    if (!searchOpen || term.length < 3 || !runtime?.geo.bbox) {
      setExternalPlaces([]);
      setExternalLoading(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const { west, north, east, south } = runtime.geo.bbox!;
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "6");
      url.searchParams.set("countrycodes", "gt");
      url.searchParams.set("addressdetails", "1");
      url.searchParams.set("bounded", "1");
      url.searchParams.set("viewbox", `${west},${north},${east},${south}`);
      url.searchParams.set("q", `${term}, ${municipality_name}, Guatemala`);
      setExternalLoading(true);
      void fetch(url, { signal: controller.signal })
        .then(async (response) =>
          response.ok ? ((await response.json()) as ExternalPlace[]) : [],
        )
        .then((places) => setExternalPlaces(places))
        .catch(() => setExternalPlaces([]))
        .finally(() => setExternalLoading(false));
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [municipality_name, query, runtime?.geo.bbox, searchOpen]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !runtime?.geo.bbox) return;
    let cancelled = false;
    void ensureLeaflet()
      .then((L) => {
        if (cancelled || !mapNode.current || !runtime.geo.bbox) return;
        const map = L.map(mapNode.current, {
          zoomControl: false,
          attributionControl: true,
          preferCanvas: true,
        });
        L.control.zoom({ position: "bottomright" }).addTo(map);
        const bounds = L.latLngBounds([
          [runtime.geo.bbox.south, runtime.geo.bbox.west],
          [runtime.geo.bbox.north, runtime.geo.bbox.east],
        ]);
        map.fitBounds(bounds, { padding: [18, 18], maxZoom: 14 });
        map.on("click", (event) => {
          if (!createModeRef.current) return;
          setSelectedCommunity(null);
          setSelectedPlace(null);
          setActivityPoint({
            lat: event.latlng.lat,
            lon: event.latlng.lng,
            label: "Punto exacto en el mapa",
          });
          setCreateMode(false);
          map.flyTo([event.latlng.lat, event.latlng.lng], 16, {
            duration: 0.65,
          });
        });
        mapRef.current = map;
        setMapReady(true);
        window.setTimeout(() => map.invalidateSize(), 80);
      })
      .catch(() => setMapReady(false));
    return () => {
      cancelled = true;
      drawnRef.current.forEach((layer) => layer.remove());
      drawnRef.current = [];
      baseLayerRef.current?.remove();
      baseLayerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [runtime?.geo.bbox]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    void ensureLeaflet().then((L) => {
      if (!mapRef.current) return;
      baseLayerRef.current?.remove();
      baseLayerRef.current = L.tileLayer(
        satellite
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom: 19,
          attribution: satellite ? "Tiles © Esri" : "© OpenStreetMap",
        },
      ).addTo(mapRef.current);
    });
  }, [mapReady, satellite]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    void ensureLeaflet().then((L) => {
      const map = mapRef.current;
      if (!map) return;
      drawnRef.current.forEach((layer) => layer.remove());
      drawnRef.current = [];
      if (layers.concentracion && !createMode) {
        topCommunities.forEach((community) => {
          const radius = Math.max(
            340,
            Math.min(1500, 300 + community.elector_count / 4),
          );
          const circle = L.circle([community.lat, community.lon], {
            radius,
            color: "#552676",
            weight: 1,
            fillColor: "#552676",
            fillOpacity: 0.14,
          })
            .bindTooltip(
              `<b>${clean(community.community_label)}</b><br>${fmt.format(community.elector_count)} empadronados<br><small>${clean(community.precision)} · agregado comunitario</small>`,
            )
            .on("click", () => setSelectedCommunity(community))
            .addTo(map);
          drawnRef.current.push(circle);
        });
      }
      if (layers.prioridades && !createMode) {
        priorityCenters.forEach((center) => {
          const lat = center.lat;
          const lon = center.lon;
          if (lat === null || lon === null) return;
          const circle = L.circle([lat, lon], {
            radius: 650,
            color: "#b84e3e",
            weight: 2,
            dashArray: "5 7",
            fillColor: "#d69070",
            fillOpacity: 0.1,
          })
            .bindTooltip(
              `<b>${clean(center.name)}</b><br>${fmt.format(center.voters ?? 0)} empadronados · prioridad territorial`,
            )
            .addTo(map);
          drawnRef.current.push(circle);
        });
      }
      if (layers.centros && !createMode) {
        centers.forEach((center) => {
          const lat = center.lat;
          const lon = center.lon;
          if (lat === null || lon === null) return;
          const marker = L.circleMarker([lat, lon], {
            radius: 7,
            color: "#fff",
            weight: 2,
            fillColor: "#09566C",
            fillOpacity: 1,
          })
            .bindTooltip(
              `<b>${clean(center.name)}</b><br>${clean(center.community)} · ${fmt.format(center.voters ?? 0)} empadronados`,
            )
            .addTo(map);
          drawnRef.current.push(marker);
        });
      }
      if (layers.agenda && !createMode) {
        visibleActivities.forEach((activity) => {
          if (activity.latitude === null || activity.longitude === null) return;
          const type = activity.activity_type || "OTRA";
          const color = mapActivityColors[type] || mapActivityColors.OTRA;
          const points = Array.isArray(activity.details?.route_points)
            ? (activity.details.route_points as unknown[]).filter(
                (point): point is LatLng => Array.isArray(point) && point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]),
              )
            : [];
          if (showRoutes && points.length > 1) {
            const route = L.polyline(points, { color, weight: 6, opacity: 0.9 })
              .bindTooltip(`<b>${clean(activity.title)}</b><br>Ruta de ${clean(mapActivityLabels[type] || type)}`)
              .on("click", () => setSelectedActivity(activity))
              .addTo(map);
            drawnRef.current.push(route);
          }
          const marker = L.marker([activity.latitude, activity.longitude], {
            icon: L.divIcon({
              className: "agenda-map-marker-shell",
              html: `<span class="agenda-map-marker" style="--activity-color:${color}">●</span>`,
              iconSize: [34, 42],
              iconAnchor: [17, 38],
            }),
          })
            .bindTooltip(`<b>${clean(activity.title)}</b><br>${clean(activity.community || "Actividad geolocalizada")}`)
            .on("click", () => setSelectedActivity(activity))
            .addTo(map);
          drawnRef.current.push(marker);
        });
      }
      const exactPoint = activityPoint ?? selectedPlace;
      if (exactPoint) {
        const marker = L.marker([exactPoint.lat, exactPoint.lon], {
          icon: L.divIcon({
            className: "free-point-shell",
            html: '<span class="free-point-marker">＋</span>',
            iconSize: [42, 42],
            iconAnchor: [21, 38],
          }),
        })
          .bindTooltip(
            activityPoint
              ? "Punto exacto para la nueva actividad"
              : `<b>${clean(selectedPlace?.name ?? "Lugar encontrado")}</b><br>Lugar encontrado`,
          )
          .addTo(map);
        drawnRef.current.push(marker);
      }
    });
  }, [
    activityPoint,
    centers,
    createMode,
    layers.centros,
    layers.concentracion,
    layers.agenda,
    layers.prioridades,
    mapReady,
    priorityCenters,
    selectedPlace,
    topCommunities,
    visibleActivities,
    showRoutes,
  ]);

  const selectCommunity = (community: CommunityPoint) => {
    setSelectedCommunity(community);
    setSelectedPlace(null);
    setQuery(community.community_label);
    setSearchOpen(false);
    mapRef.current?.flyTo([community.lat, community.lon], 15, {
      duration: 0.65,
    });
  };
  const selectTerritory = (place: TerritorySuggestion) => {
    setSelectedPlace(place);
    setSelectedCommunity(null);
    setQuery(place.name);
    setSearchOpen(false);
    mapRef.current?.flyTo([place.lat, place.lon], 16, { duration: 0.65 });
  };
  const selectExternal = (place: ExternalPlace) => {
    const lat = Number(place.lat);
    const lon = Number(place.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    selectTerritory({
      key: `external-${place.place_id}`,
      name: place.name || place.display_name.split(",")[0],
      category: place.addresstype || place.type || "Lugar",
      detail: place.display_name,
      lat,
      lon,
    });
  };
  const toggleLayer = (key: LayerKey) =>
    setLayers((current) => ({ ...current, [key]: !current[key] }));
  const layerButton = (key: LayerKey, label: string, color: string) => (
    <button
      type="button"
      key={key}
      className={`map-layer-${key} ${layers[key] ? "on" : ""}`}
      onClick={() => toggleLayer(key)}
    >
      <i style={{ background: color }} />
      <span>{label}</span>
      <em>{layers[key] ? "✓" : "—"}</em>
    </button>
  );
  const coverageZones = topCommunities.slice(0, 13);
  const zonesWithoutCoverage = coverageZones.filter((community) => {
    return !visibleActivities.some(
      (activity) =>
        activity.latitude !== null &&
        activity.longitude !== null &&
        distanceKm(
          [community.lat, community.lon],
          [activity.latitude, activity.longitude],
        ) < 1.5,
    );
  }).length;

  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>OPERACIÓN TERRITORIAL</p>
          <h1>Mapa Inteligente</h1>
          <span>
            Actividades, electores y comunidades prioritarias en una sola vista
          </span>
        </div>
        <div className="section-banner-actions">
          <div className="map-head-stats">
            <span>
              <b>{visibleActivities.length}</b> actividades
            </span>
            <span>
              <b>{zonesWithoutCoverage}</b> zonas sin cobertura
            </span>
          </div>
        </div>
      </section>

      <section
        className="operational-map-toolbar"
        aria-label="Controles del Mapa Inteligente"
      >
        <div className="map-search-wrap map-toolbar-search">
          <label className="map-search">
            <span aria-hidden="true">⌕</span>
            <input
              value={query}
              onFocus={() => {
                setSearchOpen(true);
                setCreateMode(false);
              }}
              onChange={(event) => {
                setQuery(event.target.value);
                setSearchOpen(true);
              }}
              type="search"
              placeholder="Buscar comunidad, estadio, municipalidad, finca…"
              autoComplete="off"
            />
          </label>
          {searchOpen && query.trim().length >= 2 ? (
            <div className="map-search-suggestions">
              {searchSuggestions.length > 0 ? (
                <small className="suggestion-group-title">
                  COMUNIDADES DEL PADRÓN
                </small>
              ) : null}
              {searchSuggestions.map((community) => (
                <button
                  key={community.community_normalized}
                  type="button"
                  onClick={() => selectCommunity(community)}
                >
                  <b>{community.community_label}</b>
                  <span>
                    {fmt.format(community.elector_count)} empadronados · 0%
                    cobertura
                  </span>
                  <small>{community.precision}</small>
                </button>
              ))}
              {territorySuggestions.length ? (
                <small className="suggestion-group-title">
                  TERRITORIOS DE RADAR
                </small>
              ) : null}
              {territorySuggestions.map((place) => (
                <button
                  key={place.key}
                  type="button"
                  onClick={() => selectTerritory(place)}
                >
                  <b>{place.name}</b>
                  <span>{place.category}</span>
                  <small>{place.detail}</small>
                </button>
              ))}
              {externalLoading || externalPlaces.length ? (
                <small className="suggestion-group-title">
                  LUGARES Y DIRECCIONES
                </small>
              ) : null}
              {externalLoading ? (
                <span className="search-loading">
                  Buscando lugares cercanos…
                </span>
              ) : null}
              {!externalLoading
                ? externalPlaces.map((place) => (
                    <button
                      key={place.place_id}
                      type="button"
                      onClick={() => selectExternal(place)}
                    >
                      <b>{place.name || place.display_name.split(",")[0]}</b>
                      <span>{place.addresstype || place.type || "Lugar"}</span>
                      <small>{place.display_name}</small>
                    </button>
                  ))
                : null}
              {!externalLoading &&
              !searchSuggestions.length &&
              !territorySuggestions.length &&
              !externalPlaces.length ? (
                <span className="search-loading">
                  No encontramos coincidencias dentro del municipio.
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        <label className="toolbar-select">
          <span>Actividades programadas</span>
          <select
            value={dateWindow}
            onChange={(event) => setDateWindow(event.target.value)}
          >
            <option value="hoy">Hoy</option>
            <option value="semana">7 días</option>
            <option value="mes">30 días</option>
            <option value="todos">Todas</option>
          </select>
        </label>
        <details className="map-more-filters">
          <summary>
            Filtros <span>⌄</span>
          </summary>
          <div className="map-more-panel">
            <div className="map-filter-grid horizontal">
              <label>
                <span>Estado</span>
                <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  <option>PLANIFICADA</option>
                  <option>CONFIRMADA</option>
                  <option>EN CURSO</option>
                  <option value="CONCLUIDA">Concluidas</option>
                  <option>CANCELADA</option>
                </select>
              </label>
              <label>
                <span>Responsable</span>
                <select value={responsibleFilter} onChange={(event) => setResponsibleFilter(event.target.value)}>
                  <option value="TODOS">Todos</option>
                  {activityResponsibles.map((responsible) => <option key={responsible} value={responsible}>{responsible}</option>)}
                </select>
              </label>
            </div>
            <div className="toolbar-layer-block">
              <small>CAPAS VISIBLES</small>
              <div className="smart-layers toolbar-layers">
                {layerButton("concentracion", "Electores", "#8b5cf6")}
                {layerButton("prioridades", "Prioritarias", "#b84e3e")}
                {layerButton("centros", "Centros de votación", "#09566C")}
                {layerButton("agenda", "Actividades", "#D69070")}
              </div>
            </div>
            <details className="activity-filter toolbar-activity-filter">
              <summary>Tipos de actividad</summary>
              <div>
                <b>Visibles</b>
                <button
                  type="button"
                  onClick={() =>
                    setActivityTypes(
                      activityTypes.length ? [] : [...mapActivityTypes],
                    )
                  }
                >
                  {activityTypes.length ? "Ocultar todo" : "Mostrar todo"}
                </button>
              </div>
              <section>
                {mapActivityTypes.map((type) => (
                  <label key={type}>
                    <input
                      type="checkbox"
                      checked={activityTypes.includes(type)}
                      onChange={() =>
                        setActivityTypes((current) =>
                          current.includes(type)
                            ? current.filter((item) => item !== type)
                            : [...current, type],
                        )
                      }
                    />
                    <i style={{ background: mapActivityColors[type] }} />
                    <span>{mapActivityLabels[type]}</span>
                  </label>
                ))}
              </section>
              <label className="route-visibility">
                <input
                  type="checkbox"
                  checked={showRoutes}
                  onChange={() => setShowRoutes((value) => !value)}
                />
                <span>Mostrar rutas dibujadas</span>
              </label>
            </details>
          </div>
        </details>
        <button
          type="button"
          className={`map-new-activity ${createMode ? "active" : ""}`}
          onClick={() => {
            setCreateMode((value) => {
              const next = !value;
              if (next) {
                setSelectedCommunity(null);
                setSelectedPlace(null);
                setActivityPoint(null);
              }
              return next;
            });
            setSearchOpen(false);
          }}
        >
          {createMode ? "Toca el punto…" : "+ Nueva actividad"}
        </button>
        <button
          type="button"
          className="map-satellite-toggle"
          onClick={() => setSatellite((value) => !value)}
        >
          {satellite ? "Vista mapa" : "Vista satelital"}
        </button>
      </section>

      {selectedCommunity ? (
        <div className="map-selection-strip">
          <span>
            <small>PADRÓN INDIVIDUAL 2023</small>
            <b>
              {selectedCommunity.community_label} ·{" "}
              {fmt.format(selectedCommunity.elector_count)}
            </b>
          </span>
          <Link
            to={`/municipio/${municipality_code}/directorio?community=${encodeURIComponent(selectedCommunity.community_label)}`}
          >
            Abrir Directorio filtrado
          </Link>
          <Link
            to={`/municipio/${municipality_code}/agenda?new=1&community=${encodeURIComponent(selectedCommunity.community_label)}&lat=${selectedCommunity.lat}&lon=${selectedCommunity.lon}`}
          >
            + Crear actividad aquí
          </Link>
          <button
            type="button"
            className="clear-selection"
            onClick={() => {
              setSelectedCommunity(null);
              setQuery("");
            }}
          >
            ×
          </button>
        </div>
      ) : selectedPlace ? (
        <div className="map-selection-strip">
          <span>
            <small>LUGAR ENCONTRADO</small>
            <b>{selectedPlace.name}</b>
          </span>
          <Link
            to={`/municipio/${municipality_code}/agenda?new=1&community=${encodeURIComponent(selectedPlace.name)}&lat=${selectedPlace.lat}&lon=${selectedPlace.lon}`}
          >
            + Crear actividad aquí
          </Link>
          <button
            type="button"
            className="clear-selection"
            onClick={() => {
              setSelectedPlace(null);
              setQuery("");
            }}
          >
            ×
          </button>
        </div>
      ) : null}

      <section className="smart-map-shell map-v3">
        <div className={`map-stage ${createMode ? "picking-activity" : ""}`}>
          {layers.concentracion && !createMode && topCommunities.length > 0 ? (
            <aside className="map-electoral-priorities">
              <header>
                <small>COBERTURA COMUNITARIA</small>
                <div>
                  <b>Electores</b>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setSelectedCommunity(null);
                      setSelectedPlace(null);
                    }}
                  >
                    Mostrar todos
                  </button>
                </div>
              </header>
              {visibleCommunityList.map((community) => (
                <button
                  key={community.community_normalized}
                  onClick={() => selectCommunity(community)}
                >
                  <span>
                    <b>{community.community_label}</b>
                    <small>Comunidad grande con baja cobertura</small>
                  </span>
                  <em>{fmt.format(community.elector_count)} · 0%</em>
                </button>
              ))}
            </aside>
          ) : null}
          {createMode ? (
            <div className="map-pick-instruction">
              <b>Nueva actividad</b>
              <span>
                Toca cualquier punto exacto del mapa. Puede ser una casa, finca
                o lugar sin registro previo.
              </span>
              <button type="button" onClick={() => setCreateMode(false)}>
                Cancelar
              </button>
            </div>
          ) : null}
          {activityPoint ? (
            <article className="free-place-card">
              <button
                type="button"
                aria-label="Descartar punto"
                onClick={() => setActivityPoint(null)}
              >
                ×
              </button>
              <small>PUNTO EXACTO SELECCIONADO</small>
              <input
                value={activityPoint.label}
                onChange={(event) =>
                  setActivityPoint({ ...activityPoint, label: event.target.value })
                }
                aria-label="Nombre del punto"
              />
              <p>
                <b>{activityPoint.lat.toFixed(6)}</b>, {activityPoint.lon.toFixed(6)}
              </p>
              <span>Podés volver a activar “Nueva actividad” para mover el punto.</span>
              <Link
                to={`/municipio/${municipality_code}/agenda?new=1&community=${encodeURIComponent(activityPoint.label || "Punto exacto en el mapa")}&lat=${activityPoint.lat}&lon=${activityPoint.lon}`}
              >
                Crear actividad aquí
              </Link>
            </article>
          ) : null}
          {selectedActivity ? (
            <article className="map-activity-card">
              <button type="button" aria-label="Cerrar actividad" onClick={() => setSelectedActivity(null)}>×</button>
              <small>{selectedActivity.activity_type || "ACTIVIDAD"}</small>
              <h3>{selectedActivity.title}</h3>
              <p>{selectedActivity.community || "Punto geolocalizado"}</p>
              <span>{selectedActivity.starts_at ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(selectedActivity.starts_at)) : "Sin fecha"}</span>
              <Link to={`/municipio/${municipality_code}/agenda?activity=${selectedActivity.id}`}>Abrir en Agenda →</Link>
            </article>
          ) : null}
          <div
            ref={mapNode}
            className="smart-map-canvas"
            aria-label={`Mapa operativo limitado al municipio de ${municipality_name}`}
          />
          <div className="map-boundary-note">
            Municipio {municipality_code} · navegación limitada
          </div>
          {selectedCommunity ? (
            <article className="territory-card">
              <button
                className="territory-card-close"
                aria-label="Cerrar ficha"
                onClick={() => setSelectedCommunity(null)}
              >
                ×
              </button>
              <header>
                <small>TARJETA TERRITORIAL · {municipality_code}</small>
                <h2>{selectedCommunity.community_label}</h2>
                <p>{selectedCommunity.precision}</p>
              </header>
              <div className="territory-card-kpis">
                <span>
                  <b>{fmt.format(selectedCommunity.elector_count)}</b>
                  <small>Electores agregados 2023</small>
                </span>
                <span>
                  <b>{activities.filter((item) => normalize(item.community || "") === normalize(selectedCommunity.community_label)).length}</b>
                  <small>Actividades registradas</small>
                </span>
                <span>
                  <b>—</b>
                  <small>Responsable vinculado</small>
                </span>
                <span>
                  <b>0</b>
                  <small>Compromisos pendientes</small>
                </span>
              </div>
              <div className="territory-card-grid">
                <section>
                  <b>Historial reciente</b>
                  <em>{activities.some((item) => normalize(item.community || "") === normalize(selectedCommunity.community_label)) ? "La actividad más reciente está disponible en Agenda." : "Sin actividades registradas."}</em>
                </section>
                <section>
                  <b>Responsables del territorio</b>
                  <em>Sin responsable asignado.</em>
                </section>
                <section>
                  <b>Acuerdos y compromisos</b>
                  <em>Sin compromisos vinculados.</em>
                </section>
                <section>
                  <b>Lectura territorial</b>
                  <span>
                    Zona sin actividad registrada en este período.
                    <small>
                      {selectedCommunity.precision}; RADAR no inventa
                      coordenadas.
                    </small>
                  </span>
                </section>
              </div>
              <footer>
                <Link to={`/municipio/${municipality_code}/agenda`}>
                  + Crear actividad aquí
                </Link>
                <Link to={`/municipio/${municipality_code}/directorio`}>
                  Asignar responsable
                </Link>
              </footer>
            </article>
          ) : null}
        </div>
      </section>
    </>
  );
}
