import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import {
  getInstalledRadarElectoralLayers,
  getInstalledRadarGeoBundle,
  getInstalledRadarRuntime,
  getInstalledRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectoralCenter } from "../data/v70ElectoralAdapter";
import type { AuthorizedVoterCommunity, GeoFeatureRecord } from "../data/radarRuntime";

type LatLng = [number, number];
type LeafletLayer = { remove(): void };
type LeafletMarker = LeafletLayer & { addTo(map: LeafletMap): LeafletMarker; bindTooltip(html: string): LeafletMarker; on(event: "click", handler: () => void): LeafletMarker };
type LeafletCircle = LeafletLayer & { addTo(map: LeafletMap): LeafletCircle; bindTooltip(html: string): LeafletCircle; on(event: "click", handler: () => void): LeafletCircle };
type LeafletBounds = { extend(point: LatLng): LeafletBounds; isValid(): boolean };
type LeafletMap = {
  fitBounds(bounds: LeafletBounds, options: { padding: [number, number]; maxZoom?: number }): LeafletMap;
  setView(point: LatLng, zoom: number): LeafletMap;
  flyTo(point: LatLng, zoom: number, options: { duration: number }): LeafletMap;
  invalidateSize(): LeafletMap;
  remove(): void;
  on(event: "click", handler: (event: { latlng: { lat: number; lng: number } }) => void): LeafletMap;
};
type LeafletNamespace = {
  map(node: HTMLElement, options: { zoomControl: boolean; attributionControl: boolean; preferCanvas: boolean }): LeafletMap;
  control: { zoom(options: { position: "bottomright" }): { addTo(map: LeafletMap): unknown } };
  tileLayer(url: string, options: { maxZoom: number; attribution: string }): LeafletLayer & { addTo(map: LeafletMap): LeafletLayer };
  latLngBounds(points: LatLng[]): LeafletBounds;
  circleMarker(point: LatLng, options: { radius: number; color: string; weight: number; fillColor: string; fillOpacity: number }): LeafletMarker;
  circle(point: LatLng, options: { radius: number; color: string; weight: number; fillColor: string; fillOpacity: number; dashArray?: string }): LeafletCircle;
};
type LeafletWindow = Window & { L?: LeafletNamespace; __radarLeafletPromise?: Promise<LeafletNamespace> };

type LayerKey = "concentracion" | "prioridades" | "centros" | "agenda";
type CommunityPoint = AuthorizedVoterCommunity & { lat: number; lon: number; precision: string };

const fmt = new Intl.NumberFormat("es-GT");
const mapActivityTypes = ["VISITA", "REUNION", "MITIN", "CAMINATA", "EVENTO", "RECORRIDO", "CAPACITACION", "OTRA"] as const;
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
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}
function clean(value: string) { return value.replace(/[<>&]/g, ""); }

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
  target.__radarLeafletPromise = new Promise<LeafletNamespace>((resolve, reject) => {
    const finish = () => target.L ? resolve(target.L) : reject(new Error("Leaflet did not initialize"));
    const existing = document.getElementById("radar-leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", finish, { once: true });
      existing.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "radar-leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.async = true;
    script.addEventListener("load", finish, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
    document.head.appendChild(script);
  });
  return target.__radarLeafletPromise;
}

function pointFromFeature(feature: GeoFeatureRecord | undefined) {
  if (!feature || feature.latitude === null || feature.longitude === null) return null;
  return { lat: feature.latitude, lon: feature.longitude };
}

function communityPoint(community: AuthorizedVoterCommunity, features: GeoFeatureRecord[], centers: V70ElectoralCenter[]) {
  const target = normalize(community.community_label);
  const exact = features.find((feature) => feature.latitude !== null && feature.longitude !== null && normalize(feature.feature_name ?? "") === target);
  const partial = exact ?? features.find((feature) => {
    if (feature.latitude === null || feature.longitude === null) return false;
    const name = normalize(feature.feature_name ?? "");
    return target.length >= 5 && name.length >= 5 && (name.includes(target) || target.includes(name));
  });
  const featurePoint = pointFromFeature(partial);
  if (featurePoint) return { ...community, ...featurePoint, precision: exact ? "Comunidad georreferenciada" : "Referencia oficial relacionada" };
  const center = centers.find((item) => {
    const haystack = normalize(`${item.community} ${item.name}`);
    return target.length >= 5 && (haystack.includes(target) || target.includes(normalize(item.community)));
  });
  if (center && center.lat !== null && center.lon !== null) return { ...community, lat: center.lat, lon: center.lon, precision: `Referencia territorial TSE · ${center.community}` };
  return null;
}

export function V70OperationalMap() {
  const { municipality_code, municipality_name } = useMunicipalityContext();
  const runtime = getInstalledRadarRuntime(municipality_code);
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);
  const voterCommunities = getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const electoralLayers = getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const electoral = useMemo(() => {
    try { return electoralLayers.length ? adaptAuthorizedElectoralTerritoryLayers(electoralLayers) : null; }
    catch { return null; }
  }, [electoralLayers]);
  const centers = electoral?.centers ?? [];

  const mapNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const baseLayerRef = useRef<LeafletLayer | null>(null);
  const drawnRef = useRef<LeafletLayer[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({ concentracion: true, prioridades: false, centros: false, agenda: true });
  const [activityTypes, setActivityTypes] = useState<string[]>([...mapActivityTypes]);
  const [showRoutes, setShowRoutes] = useState(true);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [dateWindow, setDateWindow] = useState("mes");
  const [createMode, setCreateMode] = useState(false);
  const [selectedCommunity, setSelectedCommunity] = useState<CommunityPoint | null>(null);
  const [selectedCenter, setSelectedCenter] = useState<V70ElectoralCenter | null>(null);

  const mappedCommunities = useMemo(() => voterCommunities
    .map((item) => communityPoint(item, geoBundle?.features ?? [], centers))
    .filter((item): item is CommunityPoint => Boolean(item)), [voterCommunities, geoBundle, centers]);
  const topCommunities = useMemo(() => mappedCommunities.slice(0, 13), [mappedCommunities]);
  const searchSuggestions = useMemo(() => {
    const term = normalize(query);
    if (term.length < 2) return [];
    return mappedCommunities.filter((item) => normalize(item.community_label).includes(term)).slice(0, 7);
  }, [mappedCommunities, query]);
  const visibleCommunityList = useMemo(() => {
    const term = normalize(query);
    if (!term) return topCommunities.slice(0, 7);
    return mappedCommunities.filter((item) => normalize(item.community_label).includes(term)).slice(0, 7);
  }, [mappedCommunities, query, topCommunities]);
  const priorityCenters = useMemo(() => [...centers].sort((a, b) => (b.voters ?? 0) - (a.voters ?? 0)).slice(0, 5), [centers]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current || !runtime?.geo.bbox) return;
    let cancelled = false;
    void ensureLeaflet().then((L) => {
      if (cancelled || !mapNode.current || !runtime.geo.bbox) return;
      const map = L.map(mapNode.current, { zoomControl: false, attributionControl: true, preferCanvas: true });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      const bounds = L.latLngBounds([[runtime.geo.bbox.south, runtime.geo.bbox.west], [runtime.geo.bbox.north, runtime.geo.bbox.east]]);
      map.fitBounds(bounds, { padding: [18, 18], maxZoom: 14 });
      map.on("click", (event) => {
        if (!createMode) return;
        setSelectedCommunity(null);
        setSelectedCenter(null);
        map.flyTo([event.latlng.lat, event.latlng.lng], 16, { duration: .65 });
      });
      mapRef.current = map;
      setMapReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    }).catch(() => setMapReady(false));
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
  }, [runtime?.geo.bbox, createMode]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    void ensureLeaflet().then((L) => {
      if (!mapRef.current) return;
      baseLayerRef.current?.remove();
      baseLayerRef.current = L.tileLayer(
        satellite
          ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
          : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        { maxZoom: 19, attribution: satellite ? "Tiles © Esri" : "© OpenStreetMap" },
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
      if (layers.concentracion) {
        topCommunities.forEach((community) => {
          const radius = Math.max(180, Math.min(1150, 150 + community.elector_count * .18));
          const circle = L.circle([community.lat, community.lon], { radius, color: "#5A2973", weight: 2, fillColor: "#7d49a2", fillOpacity: .20 })
            .bindTooltip(`<b>${clean(community.community_label)}</b><br>${fmt.format(community.elector_count)} empadronados<br><small>${clean(community.precision)} · agregado comunitario</small>`)
            .on("click", () => setSelectedCommunity(community)).addTo(map);
          drawnRef.current.push(circle);
        });
      }
      if (layers.prioridades) {
        priorityCenters.forEach((center) => {
          const lat = center.lat;
          const lon = center.lon;
          if (lat === null || lon === null) return;
          const circle = L.circle([lat, lon], { radius: 650, color: "#b84e3e", weight: 2, dashArray: "5 7", fillColor: "#d69070", fillOpacity: .10 })
            .bindTooltip(`<b>${clean(center.name)}</b><br>${fmt.format(center.voters ?? 0)} empadronados · prioridad territorial`)
            .on("click", () => setSelectedCenter(center)).addTo(map);
          drawnRef.current.push(circle);
        });
      }
      if (layers.centros) {
        centers.forEach((center) => {
          const lat = center.lat;
          const lon = center.lon;
          if (lat === null || lon === null) return;
          const marker = L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 2, fillColor: "#09566C", fillOpacity: 1 })
            .bindTooltip(`<b>${clean(center.name)}</b><br>${clean(center.community)} · ${fmt.format(center.voters ?? 0)} empadronados`)
            .on("click", () => setSelectedCenter(center)).addTo(map);
          drawnRef.current.push(marker);
        });
      }
    });
  }, [centers, layers.centros, layers.concentracion, layers.prioridades, mapReady, priorityCenters, topCommunities]);

  useEffect(() => {
    if (!mapReady || !query.trim()) return;
    const normalized = normalize(query);
    const community = mappedCommunities.find((item) => normalize(item.community_label).includes(normalized));
    if (community) mapRef.current?.flyTo([community.lat, community.lon], 15, { duration: .65 });
  }, [query, mappedCommunities, mapReady]);

  const selectCommunity = (community: CommunityPoint) => {
    setSelectedCommunity(community);
    setSelectedCenter(null);
    setQuery(community.community_label);
    setSearchOpen(false);
    mapRef.current?.flyTo([community.lat, community.lon], 15, { duration: .65 });
  };
  const toggleLayer = (key: LayerKey) => setLayers((current) => ({ ...current, [key]: !current[key] }));
  const layerButton = (key: LayerKey, label: string, color: string) => <button type="button" key={key} className={`map-layer-${key} ${layers[key] ? "on" : ""}`} onClick={() => toggleLayer(key)}><i style={{ background: color }} /><span>{label}</span><em>{layers[key] ? "✓" : "—"}</em></button>;
  const zonesWithoutCoverage = Math.max(centers.length || topCommunities.length, 0);

  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>OPERACIÓN TERRITORIAL</p><h1>Mapa Inteligente</h1><span>Actividades, electores y comunidades prioritarias en una sola vista</span></div><div className="section-banner-actions"><div className="map-head-stats"><span><b>0</b> actividades</span><span><b>{zonesWithoutCoverage}</b> zonas sin cobertura</span></div></div></section>

    <section className="operational-map-toolbar" aria-label="Controles del Mapa Inteligente">
      <div className="map-search-wrap map-toolbar-search">
        <label className="map-search"><span aria-hidden="true">⌕</span><input value={query} onFocus={() => { setSearchOpen(true); setCreateMode(false); }} onChange={(event) => { setQuery(event.target.value); setSearchOpen(true); }} type="search" placeholder="Buscar comunidad, estadio, municipalidad, finca…" autoComplete="off" /></label>
        {searchOpen && query.trim().length >= 2 ? <div className="map-search-suggestions">
          {searchSuggestions.length > 0 ? <small className="suggestion-group-title">COMUNIDADES DEL PADRÓN</small> : null}
          {searchSuggestions.map((community) => <button key={community.community_normalized} type="button" onClick={() => selectCommunity(community)}><b>{community.community_label}</b><span>{fmt.format(community.elector_count)} empadronados · 0% cobertura</span><small>{community.precision}</small></button>)}
          {!searchSuggestions.length ? <span className="search-loading">No encontramos coincidencias dentro del municipio.</span> : null}
        </div> : null}
      </div>
      <label className="toolbar-select"><span>Actividades programadas</span><select value={dateWindow} onChange={(event) => setDateWindow(event.target.value)}><option value="hoy">Hoy</option><option value="semana">7 días</option><option value="mes">30 días</option><option value="todos">Todas</option></select></label>
      <details className="map-more-filters"><summary>Filtros <span>⌄</span></summary><div className="map-more-panel"><div className="map-filter-grid horizontal"><label><span>Estado</span><select defaultValue="TODOS"><option value="TODOS">Todos</option><option>PLANIFICADA</option><option>CONFIRMADA</option><option>EN CURSO</option><option>Concluidas</option><option>CANCELADA</option></select></label><label><span>Responsable</span><select defaultValue="TODOS"><option value="TODOS">Todos</option></select></label></div><div className="toolbar-layer-block"><small>CAPAS VISIBLES</small><div className="smart-layers toolbar-layers">{layerButton("concentracion", "Electores", "#8b5cf6")}{layerButton("prioridades", "Prioritarias", "#b84e3e")}{layerButton("centros", "Centros de votación", "#09566C")}{layerButton("agenda", "Actividades", "#D69070")}</div></div><details className="activity-filter toolbar-activity-filter"><summary>Tipos de actividad</summary><div><b>Visibles</b><button type="button" onClick={() => setActivityTypes(activityTypes.length ? [] : [...mapActivityTypes])}>{activityTypes.length ? "Ocultar todo" : "Mostrar todo"}</button></div><section>{mapActivityTypes.map((type) => <label key={type}><input type="checkbox" checked={activityTypes.includes(type)} onChange={() => setActivityTypes((current) => current.includes(type) ? current.filter((item) => item !== type) : [...current, type])} /><i style={{ background: mapActivityColors[type] }} /><span>{mapActivityLabels[type]}</span></label>)}</section><label className="route-visibility"><input type="checkbox" checked={showRoutes} onChange={() => setShowRoutes((value) => !value)} /><span>Mostrar rutas dibujadas</span></label></details></div></details>
      <button type="button" className={`map-new-activity ${createMode ? "active" : ""}`} onClick={() => { setCreateMode((value) => !value); setSearchOpen(false); }}>{createMode ? "Toca el punto…" : "+ Nueva actividad"}</button>
      <button type="button" className="map-satellite-toggle" onClick={() => setSatellite((value) => !value)}>{satellite ? "Vista mapa" : "Vista satelital"}</button>
    </section>

    {selectedCommunity ? <div className="map-selection-strip"><span><small>PADRÓN INDIVIDUAL 2023</small><b>{selectedCommunity.community_label} · {fmt.format(selectedCommunity.elector_count)}</b></span><Link to={`/municipio/${municipality_code}/directorio`}>Abrir Directorio filtrado</Link><Link to={`/municipio/${municipality_code}/agenda`}>+ Crear actividad aquí</Link><button type="button" className="clear-selection" onClick={() => { setSelectedCommunity(null); setQuery(""); }}>×</button></div> : null}

    <section className="smart-map-shell map-v3"><div className={`map-stage ${createMode ? "picking-activity" : ""}`}>
      {layers.concentracion && topCommunities.length > 0 ? <aside className="map-electoral-priorities"><header><small>COBERTURA COMUNITARIA</small><div><b>Electores</b><button type="button" onClick={() => { setQuery(""); setSelectedCommunity(null); }}>Mostrar todos</button></div></header>{visibleCommunityList.map((community) => <button key={community.community_normalized} onClick={() => selectCommunity(community)}><span><b>{community.community_label}</b><small>Comunidad grande con baja cobertura</small></span><em>{fmt.format(community.elector_count)} · 0%</em></button>)}</aside> : null}
      {createMode ? <div className="map-pick-instruction"><b>Nueva actividad</b><span>Toca cualquier punto exacto del mapa. Puede ser una casa, finca o lugar sin registro previo.</span><button type="button" onClick={() => setCreateMode(false)}>Cancelar</button></div> : null}
      <div ref={mapNode} className="smart-map-canvas" aria-label={`Mapa operativo limitado al municipio de ${municipality_name}`} />
      <div className="map-boundary-note">Municipio {municipality_code} · navegación limitada</div>
      {selectedCommunity ? <article className="territory-card"><button className="territory-card-close" aria-label="Cerrar ficha" onClick={() => setSelectedCommunity(null)}>×</button><header><small>TARJETA TERRITORIAL · {municipality_code}</small><h2>{selectedCommunity.community_label}</h2><p>{selectedCommunity.precision}</p></header><div className="territory-card-kpis"><span><b>{fmt.format(selectedCommunity.elector_count)}</b><small>Electores agregados 2023</small></span><span><b>0</b><small>Actividades registradas</small></span><span><b>—</b><small>Responsable vinculado</small></span><span><b>0</b><small>Compromisos pendientes</small></span></div><div className="territory-card-grid"><section><b>Historial reciente</b><em>Sin actividades registradas.</em></section><section><b>Responsables del territorio</b><em>Sin responsable asignado.</em></section><section><b>Acuerdos y compromisos</b><em>Sin compromisos vinculados.</em></section><section><b>Lectura territorial</b><span>Zona sin actividad registrada en este período.<small>{selectedCommunity.precision}; RADAR no inventa coordenadas.</small></span></section></div><footer><Link to={`/municipio/${municipality_code}/agenda`}>+ Crear actividad aquí</Link><Link to={`/municipio/${municipality_code}/directorio`}>Asignar responsable</Link></footer></article> : null}
    </div></section>
  </>;
}
