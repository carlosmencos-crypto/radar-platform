import { useEffect, useState } from "react";
import { runAdminAction, type AdminSnapshot } from "./radarAdminApi";

type Rollup = {
  generated_at: string;
  environment: "REAL" | "DEMO";
  summary: Record<string, number | string | null>;
  results: Array<{ territory: string; party_id: string; party_name: string; candidate_name: string | null; votes: number }>;
  territories: Array<{ territory: string; actas: number; valid_votes: number; blank_votes: number; null_votes: number }>;
  municipalities: Array<{ municipality_code: string; municipality_name: string; fiscales: number; received: number; counted: number; valid_votes: number }>;
};

const elections = [
  ["CORPORACION_MUNICIPAL", "Corporaciones municipales"],
  ["DIP_DIST", "Diputados distritales"],
  ["DIP_NAC", "Listado nacional"],
  ["DIP_PAR", "Parlacen"],
  ["PRESIDENTE", "Presidencia"],
] as const;
const n = (value: unknown) => Number(value ?? 0).toLocaleString("es-GT");

export function NationalRtd({ snapshot }: { snapshot: AdminSnapshot }) {
  const [mode, setMode] = useState<"REAL" | "DEMO">("DEMO");
  const [election, setElection] = useState("PRESIDENTE");
  const [year, setYear] = useState(2023);
  const [round, setRound] = useState(1);
  const [department, setDepartment] = useState("");
  const [municipality, setMunicipality] = useState("");
  const [territory, setTerritory] = useState("");
  const [receivedOnly, setReceivedOnly] = useState(false);
  const [auto, setAuto] = useState(true);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Rollup | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setData(null);
    setError("");
    async function load() {
      if (cancelled) return;
      if (document.hidden) {
        timer = setTimeout(load, 30_000);
        return;
      }
      setBusy(true);
      try {
        const next = await runAdminAction<Rollup>("national_rtd", {
          election_type: election,
          election_cycle: year,
          election_round: round,
          department_code: department,
          municipality_code: municipality,
          data_mode: mode,
        });
        if (!cancelled) {
          setData(next);
          setError("");
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "No se pudo actualizar RTD.");
      } finally {
        if (!cancelled) {
          setBusy(false);
          if (auto) timer = setTimeout(load, 30_000);
        }
      }
    }
    if (year >= 2023 && year <= 2100) void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, election, year, round, department, municipality, auto, revision]);

  const visibleMunicipalities = (data?.municipalities ?? []).filter(item => !receivedOnly || Number(item.received) > 0);
  const departments = Array.from(new Map(snapshot.municipalities.map((item) => [item.department_code, item.department_name])).entries()).sort((a, b) => a[1].localeCompare(b[1]));
  const selected = territory || (data?.territories.length === 1 ? data.territories[0].territory : "");
  const results = (data?.results ?? []).filter((result) => result.territory === selected).sort((a, b) => b.votes - a.votes);
  const total = data?.territories.find((item) => item.territory === selected)?.valid_votes ?? 0;
  const territoryLabel = (code: string) => election === "CORPORACION_MUNICIPAL"
    ? (snapshot.municipalities.find((item) => item.municipality_code === code)?.municipality_name ?? code)
    : election === "DIP_DIST" ? `Distrito ${code}` : "Consolidado de territorios seleccionados";
  const changeElection = (value: string) => {
    setElection(value);
    setRound(1);
    setTerritory("");
  };
  const changeMode = (value: "REAL" | "DEMO") => {
    setMode(value);
    setYear(value === "DEMO" ? 2023 : 2027);
    setDepartment("");
    setMunicipality("");
    setTerritory("");
  };

  return <section className="rtd-national">
    <div className="rtd-national-heading">
      <div><small>DÍA D · CONSOLIDADO NACIONAL</small><h2>Una vista de toda la operación</h2><p>Fiscales, actas y votos recibidos desde el portal fiscal. Resultados preliminares, no oficiales.</p></div>
      <span className={`rtd-quality ${mode.toLowerCase()}`}>{mode === "DEMO" ? "Pruebas demo aisladas" : "Operación real Día D"}</span>
    </div>
    <div className="rtd-election-tabs" role="group" aria-label="Elección">
      {elections.map(([id, label]) => <button key={id} type="button" aria-pressed={election === id} onClick={() => changeElection(id)}>{label}</button>)}
    </div>
    <div className="rtd-national-filters">
      <label>Entorno<select value={mode} onChange={(event) => changeMode(event.target.value as "REAL" | "DEMO")}><option value="REAL">Resultados reales</option><option value="DEMO">Pruebas demo</option></select></label>
      <label>Año electoral<input type="number" min="2023" max="2100" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
      {election === "PRESIDENTE" && <label>Vuelta<select value={round} onChange={(event) => setRound(Number(event.target.value))}><option value="1">Primera vuelta</option><option value="2">Segunda vuelta</option></select></label>}
      <label>Departamento<select value={department} onChange={(event) => { setDepartment(event.target.value); setMunicipality(""); setTerritory(""); }}><option value="">Todos</option>{departments.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Municipio<select value={municipality} onChange={(event) => { setMunicipality(event.target.value); setTerritory(""); }}><option value="">Todos</option>{snapshot.municipalities.filter((item) => !department || item.department_code === department).map((item) => <option key={item.municipality_code} value={item.municipality_code}>{item.municipality_name} · {item.municipality_code}</option>)}</select></label>
    </div>
    <div className="rtd-update-row"><label><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)} />Actualizar cada 30 segundos</label><span>{data ? `Último corte: ${new Date(data.generated_at).toLocaleTimeString("es-GT")}` : "Esperando primer corte"}</span><button type="button" disabled={busy} onClick={() => setRevision((current) => current + 1)}>{busy ? "Actualizando…" : "Actualizar ahora"}</button></div>
    {error && <p className="rtd-error" role="alert">{error} {data ? "Se conserva el último corte; no está actualizado." : ""}</p>}
    {data ? <>
      <div className="rtd-national-metrics">{[["Fiscales registrados", data.summary.fiscales], ["Municipios con actas válidas", `${n(data.summary.reporting_municipalities)} / ${n(data.summary.municipalities)}`], ["Actas contabilizadas", data.summary.counted], ["Votos válidos", data.summary.valid_votes]].map(([label, value]) => <div key={String(label)}><span>{label}</span><strong>{typeof value === "number" ? n(value) : value}</strong></div>)}</div>
      <div className="rtd-reception"><span>Recibidas <b>{n(data.summary.received)}</b></span><span>Pendientes de revisión <b>{n(data.summary.pending)}</b></span><span>Conflictos entre reportes <b>{n(data.summary.conflicts)}</b></span><span>Duplicados excluidos <b>{n(data.summary.duplicates)}</b></span><span>Blancos <b>{n(data.summary.blank_votes)}</b></span><span>Nulos <b>{n(data.summary.null_votes)}</b></span></div>
      <div className="rtd-results-panel"><div className="rtd-panel-heading"><h3>Resultados por opción electoral</h3>{data.territories.length > 1 && <label>Territorio<select value={selected} onChange={(event) => setTerritory(event.target.value)}><option value="">Seleccionar territorio</option>{data.territories.map((item) => <option key={item.territory} value={item.territory}>{territoryLabel(item.territory)}</option>)}</select></label>}</div>
        {!data.territories.length ? <div className="rtd-empty"><h3>Todavía no hay actas listas para sumar</h3><p>No existen folios válidos para esta elección, año y entorno. Los borradores o actas que no cuadran permanecen fuera del resultado.</p></div> : !selected ? <p className="rtd-empty">Selecciona un municipio o distrito para ver sus opciones y votos.</p> : <><p className="rtd-scope-label">{territoryLabel(selected)} · {n(total)} votos válidos</p><div className="rtd-vote-bars">{results.map((result) => <div key={result.party_id}><div><span><b>{result.party_name}</b>{result.candidate_name && <small>{result.candidate_name}</small>}</span><strong>{n(result.votes)} <small>{total ? ((result.votes / total) * 100).toFixed(1) : "0.0"}%</small></strong></div><div className="rtd-bar-track"><i style={{ width: `${total ? 100 * result.votes / total : 0}%` }} /></div></div>)}</div></>}
      </div>
      <div className="rtd-results-panel"><div className="rtd-municipality-heading"><div><h3>Recepción por municipio</h3><p>{n(visibleMunicipalities.length)} de {n(data.municipalities.length)} municipios · {mode === "DEMO" ? "DEMO" : "REAL"}</p></div><div className="rtd-received-switch" role="group" aria-label="Filtrar recepción por municipio"><button type="button" aria-pressed={!receivedOnly} onClick={() => setReceivedOnly(false)}>Todos</button><button type="button" aria-pressed={receivedOnly} onClick={() => setReceivedOnly(true)}>Con datos recibidos</button></div></div>{visibleMunicipalities.length ? <div className="rtd-table-wrap"><table><thead><tr><th>Municipio</th><th>Fiscales</th><th>Recibidas</th><th>Contabilizadas</th><th>Votos válidos</th><th><span className="sr-only">Detalle</span></th></tr></thead><tbody>{visibleMunicipalities.map((item) => <tr key={item.municipality_code}><td>{item.municipality_name}<small>{item.municipality_code}</small></td><td>{n(item.fiscales)}</td><td>{n(item.received)}</td><td>{n(item.counted)}</td><td>{n(item.valid_votes)}</td><td><button onClick={() => { setMunicipality(item.municipality_code); setTerritory(""); }}>Ver resultados →</button></td></tr>)}</tbody></table></div> : <p className="rtd-empty">{receivedOnly ? "Ningún municipio tiene datos recibidos para esta elección y entorno." : "No hay campañas activas para estos filtros."}</p>}</div>
      <details className="rtd-method"><summary>Cómo se calcula este corte</summary><p>La fuente es el folio canónico enviado desde el portal fiscal. Solo se suman actas enviadas, validadas o corregidas cuyos votos, blancos, nulos, papeletas y votantes cuadren. Borradores, pruebas técnicas y actas inconsistentes quedan fuera.</p><p>Los entornos real y demo están físicamente identificados y nunca se consolidan juntos.</p></details>
    </> : !error && <p className="rtd-empty" role="status">Consultando el consolidado…</p>}
  </section>;
}
