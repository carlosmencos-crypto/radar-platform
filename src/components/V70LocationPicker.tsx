import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import {
  getInstalledRadarGeoBundle,
  getInstalledRadarRuntime,
} from "../data/radarRuntimeCache";

export type V70RoutePoint = [number, number];

type Layer = { remove(): void; addTo(map: LeafletMap): Layer };
type LayerGroup = Layer;
type LeafletMap = {
  setView(point: V70RoutePoint, zoom: number): LeafletMap;
  flyTo(point: V70RoutePoint, zoom: number): LeafletMap;
  on(event: "click", handler: (event: { latlng: { lat: number; lng: number } }) => void): LeafletMap;
  remove(): void;
};
type Leaflet = {
  map(node: HTMLElement, options?: Record<string, unknown>): LeafletMap;
  tileLayer(url: string, options: Record<string, unknown>): Layer;
  circleMarker(point: V70RoutePoint, options: Record<string, unknown>): Layer;
  polyline(points: V70RoutePoint[], options: Record<string, unknown>): Layer;
  layerGroup(layers: Layer[]): LayerGroup;
};
type LeafletWindow = Window & {
  L?: Leaflet;
  __radarLeafletPromise?: Promise<Leaflet>;
};
type SearchResult = {
  key: string;
  display_name: string;
  lat: number;
  lon: number;
};

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
  target.__radarLeafletPromise = new Promise((resolve, reject) => {
    const done = () => target.L ? resolve(target.L) : reject(new Error("Leaflet did not initialize"));
    const existing = document.getElementById("radar-leaflet-js") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", done, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.id = "radar-leaflet-js";
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.addEventListener("load", done, { once: true });
    script.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
    document.head.appendChild(script);
  });
  return target.__radarLeafletPromise;
}

function normalize(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}

export function V70LocationPicker({
  routeMode,
  latitude,
  longitude,
  points,
  color,
  onConfirm,
  onClose,
}: {
  routeMode: boolean;
  latitude?: number;
  longitude?: number;
  points: V70RoutePoint[];
  color: string;
  onConfirm(value: { latitude: number; longitude: number; points: V70RoutePoint[]; locationName?: string }): void;
  onClose(): void;
}) {
  const { municipality_code, municipality_name } = useMunicipalityContext();
  const runtime = getInstalledRadarRuntime(municipality_code);
  const geo = getInstalledRadarGeoBundle(municipality_code);
  const center = useMemo<V70RoutePoint>(() => {
    if (latitude != null && longitude != null) return [latitude, longitude];
    const bbox = runtime?.geo.bbox;
    return bbox ? [(bbox.south + bbox.north) / 2, (bbox.west + bbox.east) / 2] : [13.948, -90.858];
  }, [latitude, longitude, runtime?.geo.bbox]);
  const node = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const drawing = useRef<LayerGroup | null>(null);
  const street = useRef<Layer | null>(null);
  const satelliteLayer = useRef<Layer | null>(null);
  const [route, setRoute] = useState<V70RoutePoint[]>(points);
  const [point, setPoint] = useState<V70RoutePoint>(center);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [pickedName, setPickedName] = useState("");
  const [satellite, setSatellite] = useState(false);
  const [status, setStatus] = useState("");

  const pickMapPoint = useCallback((lat: number, lon: number) => {
    const next: V70RoutePoint = [lat, lon];
    setPoint(next);
    if (routeMode) setRoute((current) => [...current, next]);
    setStatus("");
  }, [routeMode]);

  useEffect(() => {
    if (!node.current || mapRef.current) return;
    let cancelled = false;
    void ensureLeaflet().then((L) => {
      if (cancelled || !node.current) return;
      const map = L.map(node.current).setView(center, 13);
      street.current = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      satelliteLayer.current = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Tiles © Esri" });
      map.on("click", (event) => pickMapPoint(event.latlng.lat, event.latlng.lng));
      mapRef.current = map;
      setPoint((value) => [...value] as V70RoutePoint);
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [center, pickMapPoint]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !street.current || !satelliteLayer.current) return;
    if (satellite) {
      street.current.remove();
      satelliteLayer.current.addTo(map);
    } else {
      satelliteLayer.current.remove();
      street.current.addTo(map);
    }
  }, [satellite]);

  useEffect(() => {
    if (!mapRef.current) return;
    void ensureLeaflet().then((L) => {
      if (!mapRef.current) return;
      drawing.current?.remove();
      const layers: Layer[] = [];
      if (routeMode && route.length > 1) layers.push(L.polyline(route, { color, weight: 6, opacity: 0.92 }));
      const marker = routeMode && route.length ? route[route.length - 1] : point;
      layers.push(L.circleMarker(marker, { radius: 8, color: "#fff", weight: 3, fillColor: color, fillOpacity: 1 }));
      drawing.current = L.layerGroup(layers).addTo(mapRef.current);
    });
  }, [color, point, route, routeMode]);

  const search = useCallback(async (term: string, signal?: AbortSignal) => {
    const normalized = normalize(term);
    if (normalized.length < 2) {
      setResults([]);
      return;
    }
    const local: SearchResult[] = (geo?.features ?? []).flatMap((feature) => {
      if (feature.latitude == null || feature.longitude == null || !feature.feature_name) return [];
      if (!normalize(`${feature.feature_name} ${feature.feature_type}`).includes(normalized)) return [];
      return [{ key: `local-${feature.source_key}`, display_name: `${feature.feature_name}, ${municipality_name}`, lat: feature.latitude, lon: feature.longitude }];
    });
    const bbox = runtime?.geo.bbox;
    let external: SearchResult[] = [];
    if (bbox) {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("limit", "8");
      url.searchParams.set("countrycodes", "gt");
      url.searchParams.set("bounded", "1");
      url.searchParams.set("viewbox", `${bbox.west},${bbox.north},${bbox.east},${bbox.south}`);
      url.searchParams.set("q", `${term}, ${municipality_name}, Guatemala`);
      try {
        const response = await fetch(url, { signal });
        if (response.ok) {
          const payload = await response.json() as Array<{ place_id: number; display_name: string; lat: string; lon: string }>;
          external = payload.map((item) => ({ key: `osm-${item.place_id}`, display_name: item.display_name, lat: Number(item.lat), lon: Number(item.lon) }));
        }
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setStatus("No se pudo consultar el buscador en este momento.");
      }
    }
    const seen = new Set<string>();
    const combined = [...local, ...external].filter((item) => {
      const key = `${item.lat.toFixed(5)}:${item.lon.toFixed(5)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 6);
    setResults(combined);
    setStatus(combined.length ? "" : "No encontramos ese lugar.");
  }, [geo?.features, municipality_name, runtime?.geo.bbox]);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => void search(query, controller.signal), 350);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query, search]);

  function choose(result: SearchResult) {
    const next: V70RoutePoint = [result.lat, result.lon];
    setPoint(next);
    setPickedName(result.display_name.split(",").slice(0, 3).join(","));
    if (routeMode) setRoute((current) => current.length ? current : [next]);
    mapRef.current?.flyTo(next, 16);
    setResults([]);
    setStatus("");
  }

  const finalPoint = routeMode && route.length ? route[0] : point;
  return (
    <div className="location-picker">
      <header><div><small>{routeMode ? "DIBUJAR CAMINATA" : "UBICAR ACTIVIDAD"}</small><h3>{routeMode ? "Marca la ruta punto por punto" : "Busca o toca el mapa"}</h3></div><button type="button" onClick={onClose}>×</button></header>
      <div className="location-search"><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void search(query); } }} placeholder={`Buscar lugar o dirección en ${municipality_name}`} autoComplete="off" /><button type="button" onClick={() => void search(query)}>Buscar</button></div>
      {results.length ? <div className="location-results">{results.map((result) => <button type="button" key={result.key} onClick={() => choose(result)}>{result.display_name}</button>)}</div> : null}
      {status ? <p className="location-status">{status}</p> : null}
      <div className="location-map-shell"><div ref={node} className="location-map" /><div className="map-style-switch"><button type="button" className={!satellite ? "active" : ""} onClick={() => setSatellite(false)}>Mapa</button><button type="button" className={satellite ? "active" : ""} onClick={() => setSatellite(true)}>Satélite</button></div></div>
      <footer><div>{routeMode ? <><button type="button" onClick={() => setRoute((current) => current.slice(0, -1))}>Deshacer</button><button type="button" onClick={() => setRoute([])}>Limpiar</button><span>{route.length} puntos</span></> : <span>{point[0].toFixed(6)}, {point[1].toFixed(6)}</span>}</div><button type="button" disabled={routeMode && route.length < 2} onClick={() => onConfirm({ latitude: finalPoint[0], longitude: finalPoint[1], points: route, locationName: pickedName })}>Confirmar {routeMode ? "y congelar ruta" : "ubicación"}</button></footer>
    </div>
  );
}
