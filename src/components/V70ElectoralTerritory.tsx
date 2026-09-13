import { useEffect, useMemo, useRef, useState } from "react";
import type { MunicipalityGeoBundle } from "../data/radarRuntime";
import type {
  V70ElectionCode,
  V70ElectionSummary,
  V70ElectoralCenter,
  V70ElectoralViewModel,
} from "../data/v70ElectoralAdapter";

type Metric = "leader" | "turnout" | "margin" | "coverage";
type Layers = { electoral: boolean; schools: boolean; territory: boolean; health: boolean; works: boolean };

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
function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
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

function buildMapDocument(
  viewModel: V70ElectoralViewModel,
  geo: MunicipalityGeoBundle | undefined,
  electionCode: V70ElectionCode,
  metric: Metric,
  layers: Layers,
  selectedId: string,
) {
  const centers = viewModel.centers.filter((center) => center.lat !== null && center.lon !== null).map((center) => ({
    id: center.id,
    name: center.name,
    lat: center.lat,
    lon: center.lon,
    active: center.id === selectedId,
    color: markerColor(center, electionCode, metric),
    label: metricLabel(center, electionCode, metric),
  }));
  const support = (geo?.features ?? []).filter((feature) => feature.latitude !== null && feature.longitude !== null).map((feature) => ({
    type: feature.feature_type,
    name: feature.feature_name ?? feature.feature_type,
    lat: feature.latitude,
    lon: feature.longitude,
  }));
  const selected = centers.find((center) => center.id === selectedId) ?? null;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"><style>
html,body,#map{height:100%;width:100%;margin:0;background:#f7f5ef}.leaflet-container{font-family:Inter,Arial,sans-serif}.radar-marker-shell{background:transparent!important;border:0!important}.radar-marker{width:50px;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px 12px 12px 2px;background:var(--marker);color:white;border:3px solid white;box-shadow:0 5px 14px rgba(47,52,58,.31);transform:rotate(-45deg)}.radar-marker b,.radar-marker small{transform:rotate(45deg);display:block;line-height:1}.radar-marker b{font-size:10px}.radar-marker small{font-size:7.5px;max-width:39px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}.radar-marker-shell.active .radar-marker{box-shadow:0 0 0 4px #2d333a,0 7px 19px rgba(47,52,58,.4);transform:rotate(-45deg) scale(1.12)}.support-dot{border-radius:50%;border:2px solid #fff;box-shadow:0 2px 7px rgba(47,52,58,.25)}
</style></head><body><div id="map"></div><script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>(function(){
const centers=${escapeScriptJson(centers)};const support=${escapeScriptJson(support)};const layers=${escapeScriptJson(layers)};const selected=${escapeScriptJson(selected)};
const map=L.map('map',{zoomControl:false,attributionControl:true,preferCanvas:true});L.control.zoom({position:'bottomright'}).addTo(map);L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'}).addTo(map);const bounds=L.latLngBounds([]);
function clean(v){return String(v||'').replace(/[<>&]/g,'');}
if(layers.electoral){centers.forEach(function(c){const marker=L.marker([c.lat,c.lon],{icon:L.divIcon({className:'radar-marker-shell'+(c.active?' active':''),html:'<span class="radar-marker" style="--marker:'+c.color+'"><b>'+clean(c.id)+'</b><small>'+clean(c.label)+'</small></span>',iconSize:[54,54],iconAnchor:[27,47]}),title:c.name}).addTo(map);marker.on('click',function(){parent.postMessage({type:'RADAR_V70_CENTER_SELECT',id:c.id},'*')});bounds.extend([c.lat,c.lon]);});}
const supportStyle={school:['#a7772c',6],health_facility:['#08576e',6],populated_place:['#552676',5]};support.forEach(function(p){if(p.type==='school'&&!layers.schools)return;if(p.type==='health_facility'&&!layers.health)return;if(p.type==='populated_place'&&!layers.territory)return;const style=supportStyle[p.type];if(!style)return;L.circleMarker([p.lat,p.lon],{radius:style[1],fillColor:style[0],fillOpacity:.78,color:'#fff',weight:1.5}).bindTooltip(clean(p.name)).addTo(map);bounds.extend([p.lat,p.lon]);});
if(selected){map.setView([selected.lat,selected.lon],14,{animate:false});}else if(bounds.isValid()){map.fitBounds(bounds,{padding:[48,48],maxZoom:15});}else{map.setView([15.5,-90.25],7);}setTimeout(function(){map.invalidateSize()},80);
})();</script></body></html>`;
}

export function V70ElectoralTerritory({ viewModel, geoBundle }: { viewModel: V70ElectoralViewModel; geoBundle?: MunicipalityGeoBundle }) {
  const initialElection: V70ElectionCode = viewModel.elections.some((item) => item.code === "CORPORACION_MUNICIPAL") ? "CORPORACION_MUNICIPAL" : viewModel.elections[0]?.code ?? "CORPORACION_MUNICIPAL";
  const [selectedId, setSelectedId] = useState(viewModel.centers[0]?.id ?? "");
  const [electionCode, setElectionCode] = useState<V70ElectionCode>(initialElection);
  const [metric, setMetric] = useState<Metric>("leader");
  const [query, setQuery] = useState("");
  const [layers, setLayers] = useState<Layers>({ electoral: true, schools: true, territory: false, health: true, works: true });
  const iframeRef = useRef<HTMLIFrameElement>(null);

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
  const mapHtml = useMemo(() => buildMapDocument(viewModel, geoBundle, electionCode, metric, layers, selectedId), [viewModel, geoBundle, electionCode, metric, layers, selectedId]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow || event.data?.type !== "RADAR_V70_CENTER_SELECT") return;
      const id = typeof event.data.id === "string" ? event.data.id : "";
      if (viewModel.centers.some((center) => center.id === id)) setSelectedId(id);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [viewModel.centers]);

  if (!election) return null;
  return <>
    <section id="mapa" className="map-section exportable include-print">
      <div className="section-head map-heading"><div><p className="eyebrow">INTELIGENCIA ELECTORAL TERRITORIAL</p><h2>El voto centro por centro</h2></div><p>No mostramos únicamente al ganador: cambia la elección, compara participación, margen, cobertura de actas y las cinco fuerzas principales de cada centro.</p></div>
      <div className="election-switch" role="tablist" aria-label="Tipo de elección">
        {viewModel.elections.map((item) => <button key={item.code} className={item.code === electionCode ? "active" : ""} onClick={() => setElectionCode(item.code)}><span>{item.shortName}</span><small>{item.counted ?? "—"}/{item.expected ?? "—"} actas</small></button>)}
      </div>
      <div className="map-workspace">
        <aside className="directory">
          <div className="directory-head"><div><p className="eyebrow">DIRECTORIO ELECTORAL</p><h3>{viewModel.centers.length} centros · {viewModel.centers.reduce((total, center) => total + center.jrv, 0)} JRV</h3></div><span>{filtered.length}</span></div>
          <label className="search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro o comunidad" /></label>
          <div className="center-list">
            {filtered.map((center) => { const result = centerResult(center, electionCode); return <button key={center.id} className={`center-row ${center.id === selectedId ? "selected" : ""}`} onClick={() => setSelectedId(center.id)}><span className="center-code">{center.id}</span><span className="center-copy"><b>{center.name}</b><small>{center.community} · JRV {center.jrvRange}{center.geoState === "SIN_ASOCIACION" ? " · SIN ASOCIACIÓN" : ""}</small></span><span className="center-result"><b>{result.leader ?? result.availability}</b><small>{pct(result.leaderShare)}</small></span></button>; })}
          </div>
          <div className="directory-note"><b>Scroll independiente</b><span>Selecciona cualquier centro para mantener visibles su JRV, cobertura y desglose electoral.</span></div>
        </aside>
        <div className="map-panel">
          <div className="intelligence-map-toolbar" aria-label="Controles del mapa de Inteligencia Municipal">
            <div className="metric-switch">{(["leader", "turnout", "margin", "coverage"] as Metric[]).map((item) => <button key={item} className={metric === item ? "active" : ""} onClick={() => setMetric(item)}>{item === "leader" ? "Ganador" : item === "turnout" ? "Participación" : item === "margin" ? "Margen" : "Actas"}</button>)}</div>
            <div className="layer-switch">
              <button className={`layer-electoral ${layers.electoral ? "on" : ""}`} aria-pressed={layers.electoral} onClick={() => setLayers((value) => ({ ...value, electoral: !value.electoral }))}><i className="electoral-dot" />Electoral</button>
              <button className={`layer-schools ${layers.schools ? "on" : ""}`} aria-pressed={layers.schools} onClick={() => setLayers((value) => ({ ...value, schools: !value.schools }))}><i className="school-dot" />Escuelas <b>{schoolCount || "SIN_REGISTRO"}</b></button>
              <button className={`layer-territory ${layers.territory ? "on" : ""}`} aria-pressed={layers.territory} onClick={() => setLayers((value) => ({ ...value, territory: !value.territory }))}><i className="territory-dot" />CEM</button>
              <button className={`layer-health ${layers.health ? "on" : ""}`} aria-pressed={layers.health} onClick={() => setLayers((value) => ({ ...value, health: !value.health }))}><i className="health-dot" />Salud <b>{healthCount || "SIN_REGISTRO"}</b></button>
              <button className={`layer-works ${layers.works ? "on" : ""}`} aria-pressed={layers.works} onClick={() => setLayers((value) => ({ ...value, works: !value.works }))}><i className="works-dot" />Obras <b>NO_PUBLICADO</b></button>
            </div>
          </div>
          <div className="active-reading"><span>Visualizando</span><b>{election.shortName} · {metricNames[metric]}</b><small>Los colores y valores de los {viewModel.centers.length} nodos responden a esta selección.</small></div>
          <iframe ref={iframeRef} className="real-map" title={`Mapa interactivo de centros de votación de ${viewModel.municipalityName}`} srcDoc={mapHtml} sandbox="allow-scripts" referrerPolicy="strict-origin-when-cross-origin" style={{ border: 0 }} />
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
