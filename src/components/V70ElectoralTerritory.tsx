import { useEffect, useMemo, useRef, useState } from "react";
import type { MunicipalityGeoBundle } from "../data/radarRuntime";
import type {
  V70ElectionCode,
  V70ElectoralCenter,
  V70ElectoralViewModel,
} from "../data/v70ElectoralAdapter";
import { V70MapFullscreen } from "./V70MapFullscreen";

type Metric = "leader" | "turnout" | "margin" | "coverage";
type Layers = { electoral: boolean; schools: boolean; territory: boolean; health: boolean; works: boolean };
type LatLng = [number, number];
type LeafletIcon = object;
type LeafletBounds = { extend(point: LatLng): LeafletBounds; isValid(): boolean };
type LeafletMap = {
  fitBounds(bounds: LeafletBounds, options: { padding: [number, number] }): LeafletMap;
  setView(point: LatLng, zoom: number): LeafletMap;
  flyTo(point: LatLng, zoom: number, options: { duration: number }): LeafletMap;
  invalidateSize(): LeafletMap;
  remove(): void;
};
type LeafletMarker = {
  addTo(map: LeafletMap): LeafletMarker;
  remove(): void;
  setIcon(icon: LeafletIcon): LeafletMarker;
  on(event: "click", handler: () => void): LeafletMarker;
  bindTooltip(html: string): LeafletMarker;
};
type LeafletCircle = { addTo(map: LeafletMap): LeafletCircle; remove(): void; bindTooltip(html: string): LeafletCircle };
type LeafletLayerGroup = { addTo(map: LeafletMap): LeafletLayerGroup; remove(): void };
type LeafletNamespace = {
  map(node: HTMLElement, options: { zoomControl: boolean; attributionControl: boolean; preferCanvas: boolean }): LeafletMap;
  control: { zoom(options: { position: "bottomright" }): { addTo(map: LeafletMap): unknown } };
  tileLayer(url: string, options: { maxZoom: number; attribution: string }): { addTo(map: LeafletMap): unknown };
  latLngBounds(points: LatLng[]): LeafletBounds;
  marker(point: LatLng, options: { icon: LeafletIcon; title: string }): LeafletMarker;
  divIcon(options: { className: string; html: string; iconSize: [number, number]; iconAnchor: [number, number] }): LeafletIcon;
  circleMarker(point: LatLng, options: { radius: number; color: string; weight: number; fillColor: string; fillOpacity: number }): LeafletMarker;
  circle(point: LatLng, options: { radius: number; color: string; weight: number; dashArray: string; fillColor: string; fillOpacity: number }): LeafletCircle;
  layerGroup(layers: LeafletMarker[]): LeafletLayerGroup;
};
type LeafletWindow = Window & { L?: LeafletNamespace; __radarLeafletPromise?: Promise<LeafletNamespace> };
type SelectionChange = { electionCode: V70ElectionCode; centerId: string };

const fmt = new Intl.NumberFormat("es-GT");
const partyColors: Record<string, string> = {
  VALOR: "#ef684f",
  "VALOR UNIONISTA": "#ef684f",
  UNE: "#2e78bd",
  VAMOS: "#782f96",
  PPN: "#e4a229",
  ELEFANTE: "#24a68a",
  VIVA: "#316e56",
  SEMILLA: "#6d9f3a",
  TODOS: "#6b7780",
};
const metricNames: Record<Metric, string> = {
  leader: "Partido ganador",
  turnout: "Participación",
  margin: "Competitividad",
  coverage: "Cobertura de actas",
};

function pct(value: number | null, digits = 1) {
  return value === null || !Number.isFinite(value) ? "—" : `${(value * 100).toFixed(digits)}%`;
}
function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? "—" : fmt.format(value);
}
function centerResult(center: V70ElectoralCenter, code: V70ElectionCode) {
  return center.elections[code];
}
function markerColor(center: V70ElectoralCenter, code: V70ElectionCode, metric: Metric) {
  const result = centerResult(center, code);
  if (metric === "leader") return partyColors[result.leader ?? ""] ?? "#5f7180";
  if (metric === "turnout") return result.turnout === null ? "#7f8d88" : result.turnout >= .70 ? "#139b79" : result.turnout >= .60 ? "#e2a33d" : "#d94d4d";
  if (metric === "margin") return result.marginShare === null ? "#7f8d88" : result.marginShare < .05 ? "#ca3f55" : result.marginShare < .10 ? "#e0a63d" : "#178e73";
  if (!result.expected || result.counted === null) return "#7f8d88";
  const share = result.counted / result.expected;
  return share === 1 ? "#139b79" : share >= .9 ? "#e2a33d" : "#d94d4d";
}
function metricLabel(center: V70ElectoralCenter, code: V70ElectionCode, metric: Metric) {
  const result = centerResult(center, code);
  if (metric === "leader") return result.leader ?? result.availability;
  if (metric === "turnout") return pct(result.turnout, 0);
  if (metric === "margin") return pct(result.marginShare, 0);
  return `${result.counted ?? "—"}/${result.expected}`;
}
function clean(value: string) {
  return value.replace(/[<>&]/g, "");
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

function MetricLegend({ metric }: { metric: Metric }) {
  if (metric === "leader") return null;
  const items = metric === "turnout"
    ? [["#139b79", "70% o más"], ["#e2a33d", "60%–69.9%"], ["#d94d4d", "Menos de 60%"]]
    : metric === "margin"
      ? [["#ca3f55", "Competido: <5 puntos"], ["#e0a63d", "Intermedio: 5–9.9"], ["#178e73", "Amplio: 10+ puntos"]]
      : [["#139b79", "100% computado"], ["#e2a33d", "90%–99.9%"], ["#d94d4d", "Menos de 90%"]];
  return <div className="map-legend"><b>{metricNames[metric]}</b><div>{items.map(([color, label]) => <span key={label}><i style={{ background: color }} />{label}</span>)}</div></div>;
}

export function V70ElectoralTerritory({ viewModel, geoBundle, onSelectionChange }: { viewModel: V70ElectoralViewModel; geoBundle?: MunicipalityGeoBundle; onSelectionChange?: (selection: SelectionChange) => void }) {
  const initialElection: V70ElectionCode = viewModel.elections.some((item) => item.code === "CORPORACION_MUNICIPAL") ? "CORPORACION_MUNICIPAL" : viewModel.elections[0]?.code ?? "CORPORACION_MUNICIPAL";
  const mapNode = useRef<HTMLDivElement>(null);
  const fullscreenNode = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markersRef = useRef<Record<string, LeafletMarker>>({});
  const healthRef = useRef<LeafletLayerGroup | null>(null);
  const schoolsRef = useRef<LeafletLayerGroup | null>(null);
  const territoryRef = useRef<LeafletCircle[]>([]);
  const [selectedId, setSelectedId] = useState(viewModel.centers[0]?.id ?? "");
  const [electionCode, setElectionCode] = useState<V70ElectionCode>(initialElection);
  const [metric, setMetric] = useState<Metric>("leader");
  const [query, setQuery] = useState("");
  const [mapReady, setMapReady] = useState(false);
  const [layers, setLayers] = useState<Layers>({ electoral: true, schools: true, territory: false, health: true, works: true });

  const selected = viewModel.centers.find((center) => center.id === selectedId) ?? viewModel.centers[0];
  const election = viewModel.elections.find((item) => item.code === electionCode) ?? viewModel.elections[0];
  const selectedResult = selected ? centerResult(selected, electionCode) : null;
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es-GT");
    if (!term) return viewModel.centers;
    return viewModel.centers.filter((center) => `${center.id} ${center.name} ${center.community}`.toLocaleLowerCase("es-GT").includes(term));
  }, [query, viewModel.centers]);
  const schoolCount = geoBundle?.feature_counts.school ?? 0;
  const healthCount = geoBundle?.feature_counts.health_facility ?? 0;

  useEffect(() => {
    setSelectedId(viewModel.centers[0]?.id ?? "");
    setElectionCode(viewModel.elections.some((item) => item.code === "CORPORACION_MUNICIPAL") ? "CORPORACION_MUNICIPAL" : viewModel.elections[0]?.code ?? "CORPORACION_MUNICIPAL");
  }, [viewModel.municipalityCode, viewModel.centers, viewModel.elections]);

  useEffect(() => {
    const centerId = selected?.id ?? selectedId;
    if (!centerId) return;
    onSelectionChange?.({ electionCode, centerId });
  }, [electionCode, onSelectionChange, selected?.id, selectedId]);

  useEffect(() => {
    if (!mapNode.current || mapRef.current) return;
    let cancelled = false;
    void ensureLeaflet().then((L) => {
      if (cancelled || !mapNode.current) return;
      const map = L.map(mapNode.current, { zoomControl: false, attributionControl: true, preferCanvas: true });
      L.control.zoom({ position: "bottomright" }).addTo(map);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);
      const bounds = L.latLngBounds([]);
      viewModel.centers.forEach((center) => {
        if (center.lat === null || center.lon === null) return;
        const result = centerResult(center, initialElection);
        const marker = L.marker([center.lat, center.lon], {
          icon: L.divIcon({
            className: "radar-marker-shell",
            html: `<span class="radar-marker" style="--marker:${markerColor(center, initialElection, "leader")}"><b>${clean(center.id)}</b><small>${clean(result.leader ?? result.availability)}</small></span>`,
            iconSize: [54, 54], iconAnchor: [27, 47],
          }),
          title: center.name,
        }).addTo(map);
        marker.on("click", () => setSelectedId(center.id));
        markersRef.current[center.id] = marker;
        bounds.extend([center.lat, center.lon]);
      });
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48] });
      else map.setView([15.5, -90.25], 7);
      mapRef.current = map;
      setMapReady(true);
      window.setTimeout(() => map.invalidateSize(), 80);
    }).catch(() => setMapReady(false));
    return () => {
      cancelled = true;
      setMapReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      markersRef.current = {};
      healthRef.current = null;
      schoolsRef.current = null;
      territoryRef.current = [];
    };
  }, [viewModel.municipalityCode]);

  useEffect(() => {
    if (!mapReady) return;
    void ensureLeaflet().then((L) => {
      viewModel.centers.forEach((center) => {
        const marker = markersRef.current[center.id];
        if (!marker) return;
        const active = center.id === selectedId;
        marker.setIcon(L.divIcon({
          className: `radar-marker-shell ${active ? "active" : ""}`,
          html: `<span class="radar-marker" style="--marker:${markerColor(center, electionCode, metric)}"><b>${clean(center.id)}</b><small>${clean(metricLabel(center, electionCode, metric))}</small></span>`,
          iconSize: [active ? 62 : 54, active ? 62 : 54], iconAnchor: [active ? 31 : 27, active ? 55 : 47],
        }));
      });
    });
  }, [electionCode, mapReady, metric, selectedId, viewModel.centers]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    void ensureLeaflet().then((L) => {
      const map = mapRef.current;
      if (!map) return;
      healthRef.current?.remove();
      schoolsRef.current?.remove();
      territoryRef.current.forEach((circle) => circle.remove());
      healthRef.current = null;
      schoolsRef.current = null;
      territoryRef.current = [];
      const features = geoBundle?.features ?? [];
      if (layers.health) {
        const healthMarkers = features.filter((feature) => feature.feature_type === "health_facility" && feature.latitude !== null && feature.longitude !== null).map((site) =>
          L.circleMarker([site.latitude!, site.longitude!], { radius: 7, color: "#fff", weight: 3, fillColor: "#059669", fillOpacity: 1 })
            .bindTooltip(`<b>${clean(site.feature_name ?? "Salud")}</b>`).addTo(map),
        );
        healthRef.current = L.layerGroup(healthMarkers).addTo(map);
      }
      if (layers.schools) {
        const schoolMarkers = features.filter((feature) => feature.feature_type === "school" && feature.latitude !== null && feature.longitude !== null).map((site) =>
          L.circleMarker([site.latitude!, site.longitude!], { radius: 6, color: "#fff", weight: 2, fillColor: "#f59e0b", fillOpacity: .98 })
            .bindTooltip(`<b>${clean(site.feature_name ?? "Escuela")}</b><br><small>MINEDUC/SEGEPLAN · sede física</small>`).addTo(map),
        );
        schoolsRef.current = L.layerGroup(schoolMarkers).addTo(map);
      }
      if (layers.territory) {
        territoryRef.current = viewModel.centers.filter((center) => center.lat !== null && center.lon !== null && /^cem(?:\b|\s|\s*·)/i.test(center.community)).map((center) =>
          L.circle([center.lat!, center.lon!], { radius: 650, color: "#7c3aed", weight: 2, dashArray: "5 7", fillColor: "#8b5cf6", fillOpacity: .12 })
            .bindTooltip(`${clean(center.community)} · referencia territorial, no polígono oficial`).addTo(map),
        );
      }
    });
  }, [geoBundle, layers.health, layers.schools, layers.territory, mapReady, viewModel.centers]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    (Object.values(markersRef.current) as LeafletMarker[]).forEach((marker) => layers.electoral ? marker.addTo(map) : marker.remove());
  }, [layers.electoral, mapReady]);

  function focusCenter(id: string) {
    const center = viewModel.centers.find((item) => item.id === id);
    if (!center) return;
    setSelectedId(id);
    if (center.lat !== null && center.lon !== null) mapRef.current?.flyTo([center.lat, center.lon], 15, { duration: .8 });
  }

  if (!election) return null;
  return <>
    <section id="mapa" className="map-section exportable include-print">
      <div className="section-head map-heading"><div><p className="eyebrow">INTELIGENCIA ELECTORAL TERRITORIAL</p><h2>El voto centro por centro</h2></div><p>No mostramos únicamente al ganador: cambia la elección, compara participación, margen, cobertura de actas y las cinco fuerzas principales de cada centro.</p></div>
      <div className="election-switch" role="tablist" aria-label="Tipo de elección">
        {viewModel.elections.map((item) => <button key={item.code} className={item.code === electionCode ? "active" : ""} onClick={() => setElectionCode(item.code)}><span>{item.shortName}</span><small>{item.counted ?? "—"}/{item.expected ?? "—"} actas</small></button>)}
      </div>
      <div ref={fullscreenNode} className="map-workspace">
        <aside className="directory">
          <div className="directory-head"><div><p className="eyebrow">DIRECTORIO ELECTORAL</p><h3>{viewModel.centers.length} centros · {viewModel.centers.reduce((total, center) => total + center.jrv, 0)} JRV</h3></div><span>{filtered.length}</span></div>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro o comunidad" /></label>
          <div className="center-list">
            {filtered.map((center) => { const result = centerResult(center, electionCode); return <button key={center.id} className={`center-row ${center.id === selectedId ? "selected" : ""}`} onClick={() => focusCenter(center.id)}><span className="center-code">{center.id}</span><span className="center-copy"><b>{center.name}</b><small>{center.community} · JRV {center.jrvRange}{center.geoState === "SIN_ASOCIACION" ? " · SIN ASOCIACIÓN" : ""}</small></span><span className="center-result"><b>{result.leader ?? result.availability}</b><small>{pct(result.leaderShare)}</small></span></button>; })}
          </div>
          <div className="directory-note"><b>Scroll independiente</b><span>Selecciona cualquier centro para mantener visibles su JRV, cobertura y desglose electoral.</span></div>
        </aside>
        <div className="map-panel">
          <div className="intelligence-map-toolbar" aria-label="Controles del mapa de Inteligencia Municipal">
            <div className="metric-switch">{(["leader", "turnout", "margin", "coverage"] as Metric[]).map((item) => <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{item === "leader" ? "Ganador" : item === "turnout" ? "Participación" : item === "margin" ? "Margen" : "Actas"}</button>)}</div>
            <V70MapFullscreen targetRef={fullscreenNode} onChange={() => window.setTimeout(() => mapRef.current?.invalidateSize(), 100)} />
            <div className="layer-switch">
              <button className={`layer-electoral ${layers.electoral ? "on" : ""}`} aria-pressed={layers.electoral} onClick={() => setLayers((value) => ({ ...value, electoral: !value.electoral }))}><i className="electoral-dot" />Electoral</button>
              <button className={`layer-schools ${layers.schools ? "on" : ""}`} aria-pressed={layers.schools} onClick={() => setLayers((value) => ({ ...value, schools: !value.schools }))}><i className="school-dot" />Escuelas <b>{schoolCount || "SIN_REGISTRO"}</b></button>
              <button className={`layer-territory ${layers.territory ? "on" : ""}`} aria-pressed={layers.territory} onClick={() => setLayers((value) => ({ ...value, territory: !value.territory }))}><i className="territory-dot" />CEM</button>
              <button className={`layer-health ${layers.health ? "on" : ""}`} aria-pressed={layers.health} onClick={() => setLayers((value) => ({ ...value, health: !value.health }))}><i className="health-dot" />Salud <b>{healthCount || "SIN_REGISTRO"}</b></button>
              <button className={`layer-works ${layers.works ? "on" : ""}`} aria-pressed={layers.works} onClick={() => setLayers((value) => ({ ...value, works: !value.works }))}><i className="works-dot" />Obras <b>NO_PUBLICADO</b></button>
            </div>
          </div>
          <div className="active-reading"><span>Visualizando</span><b>{election.shortName} · {metricNames[metric]}</b><small>Los colores y valores de los {viewModel.centers.length} nodos responden a esta selección.</small></div>
          <div ref={mapNode} className="real-map" role="img" aria-label={`Mapa interactivo de centros de votación de ${viewModel.municipalityName}`} />
          <MetricLegend metric={metric} />
          <div className="map-source"><span>Mapa base © OpenStreetMap · {viewModel.qa.geoExact} centros geolocalizados{viewModel.qa.geoHeld ? ` · ${viewModel.qa.geoHeld} SIN_ASOCIACION` : ""}</span><span>TREP 2023 · corte preliminar {viewModel.snapshot ?? "no publicado"}</span></div>
          {selected && selectedResult ? <article className="center-card include-print" aria-live="polite">
            <div className="center-card-head"><span>CV {selected.id}</span><div><b>{selected.name}</b><small>{selected.community} · {selected.type}{selected.geoState === "SIN_ASOCIACION" ? " · SIN_ASOCIACION" : ""}</small></div></div>
            <div className="center-stats"><div><small>Empadronados</small><b>{number(selected.voters)}</b></div><div><small>JRV</small><b>{selected.jrvRange}</b></div><div><small>Actas computadas</small><b>{selectedResult.counted ?? "—"}/{selectedResult.expected}</b></div><div><small>Participación</small><b>{pct(selectedResult.turnout)}</b></div></div>
            <div className="result-heading"><span>Resultado · {election.shortName}</span><b>Margen {number(selectedResult.marginVotes)} · {pct(selectedResult.marginShare)}</b></div>
            <div className="mini-ranking">{selectedResult.top.map((result) => <div key={result.party}><span><b>{result.rank}. {result.party}</b><small>{fmt.format(result.votes)} · {pct(result.share)}</small></span><i><em style={{ width: `${Math.max(result.share * 100, 2)}%`, background: partyColors[result.party] ?? "#6d7d84" }} /></i></div>)}</div>
            <div className="vote-quality"><span>Votos por opción <b>{number(selectedResult.optionVotes)}</b></span><span>Blancos <b>{number(selectedResult.blankVotes)}</b></span><span>Nulos <b>{number(selectedResult.nullVotes)}</b></span></div>
          </article> : null}
        </div>
      </div>
    </section>
    <section className="section electoral-depth exportable include-print">
      <div className="section-head"><div><p className="eyebrow">LECTURA ELECTORAL MUNICIPAL</p><h2>{election.name}</h2></div><p>Ranking municipal completo de las diez fuerzas principales y lectura de calidad del corte. Los porcentajes se calculan sobre votos por opción.</p></div>
      <div className="election-summary"><div className="election-kpis">
        <article><small>Liderazgo municipal</small><b>{election.leader ?? election.availability}</b><span>{number(election.leaderVotes)} votos · {pct(election.leaderShare, 2)}</span></article>
        <article><small>Segunda fuerza</small><b>{election.runner ?? "—"}</b><span>{number(election.runnerVotes)} votos</span></article>
        <article><small>Margen</small><b>{pct(election.marginShare, 2)}</b><span>{number(election.marginVotes)} votos</span></article>
        <article><small>Actas computadas</small><b>{election.counted ?? "—"}/{election.expected ?? "—"}</b><span>{pct(election.countedShare)} de cobertura</span></article>
        <article><small>Participación</small><b>{pct(election.turnout, 2)}</b><span>{number(election.votesCast)} votos emitidos</span></article>
      </div><div className="full-ranking">{election.top.map((result) => <div className="rank-row" key={result.party}><span className="rank-number">{result.rank}</span><span className="party-name">{result.party}</span><div className="rank-bar"><i style={{ width: `${result.share * 100}%`, background: partyColors[result.party] ?? "#738087" }} /></div><b>{fmt.format(result.votes)}</b><em>{pct(result.share, 2)}</em></div>)}</div></div>
      <p className="preliminary-note">Corte preliminar TREP 2023. La cobertura varía por elección; RADAR conserva el numerador y denominador para impedir que un dato incompleto parezca definitivo.</p>
    </section>
  </>;
}
