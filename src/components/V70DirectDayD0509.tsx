import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { ensureRadarAccessToken } from "../data/radarAuth";
import {
  deleteCampaignRecord,
  loadCampaignContacts,
  loadCampaignRecords,
  saveCampaignRecord,
  type CampaignContactRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { getInstalledRadarElectoralLayers } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers } from "../data/v70ElectoralAdapter";
import { V70DirectShell0509 } from "./V70DirectShell0509";

function InternalViews({
  views,
}: {
  views: Array<{ key: string; label: string; content: ReactNode }>;
}) {
  const initial = () => {
    const hash = window.location.hash.replace(/^#/, "");
    return views.some((view) => view.key === hash)
      ? hash
      : (views[0]?.key ?? "");
  };
  const [active, setActive] = useState(initial);
  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.replace(/^#/, "");
      if (views.some((view) => view.key === hash)) setActive(hash);
    };
    window.addEventListener("hashchange", sync);
    sync();
    return () => window.removeEventListener("hashchange", sync);
  }, [views]);
  const select = (key: string) => {
    setActive(key);
    window.location.hash = key;
  };
  const selected = views.find((view) => view.key === active) ?? views[0];
  if (!selected) return null;
  return (
    <section className="internal-view-shell">
      <span className="internal-view-mobile-hint" aria-hidden="true">
        Desliza para ver más opciones →
      </span>
      <nav
        className="internal-view-tabs"
        aria-label="Centro de operaciones Día D"
      >
        {views.map((view) => (
          <button
            key={view.key}
            className={view.key === selected.key ? "active" : ""}
            onClick={() => select(view.key)}
            type="button"
          >
            <span>{view.label}</span>
          </button>
        ))}
      </nav>
      <div className="internal-view-content" data-view={selected.key}>
        {selected.content}
      </div>
    </section>
  );
}
function openDayDView(key: string) {
  window.location.hash = key;
}
function centerReference(id: string) {
  return `23-${id.padStart(3, "0")}`;
}
function centerCem(value: string) {
  return `CEM · ${value.replace(/^cem\s*-\s*/i, "").trim()}`;
}
function jrvNumbers(range: string, expected: number) {
  const parsed = range.split(/[;,]+/).flatMap((segment) => {
    const values = (segment.match(/\d+/g) ?? []).map(Number).filter(Number.isFinite);
    if (values.length >= 2) return Array.from({ length: Math.max(0, values[1] - values[0] + 1) }, (_, index) => values[0] + index);
    return values;
  });
  const unique = [...new Set(parsed)];
  if (unique.length === expected || !expected) return unique;
  if (unique.length === 1 && expected > 1) return Array.from({ length: expected }, (_, index) => unique[0] + index);
  return unique.length ? unique : Array.from({ length: expected }, (_, index) => index + 1);
}

function DayDContent() {
  const { campaign_id, municipality_code } = useMunicipalityContext();
  const layers = getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const electoral = useMemo(() => {
    try {
      return layers.length
        ? adaptAuthorizedElectoralTerritoryLayers(layers)
        : null;
    } catch {
      return null;
    }
  }, [layers]);
  const centers = electoral?.centers ?? [];
  const totalJrv = centers.reduce((sum, center) => sum + center.jrv, 0);
  const [contacts, setContacts] = useState<CampaignContactRecord[]>([]);
  const [assignments, setAssignments] = useState<CampaignModuleRecord[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [centerResponsibleId, setCenterResponsibleId] = useState("");
  const [selectedJrv, setSelectedJrv] = useState("");
  const [fiscalId, setFiscalId] = useState("");
  const [centerOpen, setCenterOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (!selectedCenterId && centers[0]) setSelectedCenterId(centers[0].id); }, [centers, selectedCenterId]);
  useEffect(() => {
    let cancelled = false; if (!campaign_id) return;
    void ensureRadarAccessToken().then(async (token) => Promise.all([loadCampaignContacts(campaign_id, token), loadCampaignRecords(campaign_id, "dia-d", token)]))
      .then(([people, records]) => { if (!cancelled) { setContacts(people ?? []); setAssignments(records ?? []); } })
      .catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "No se pudo cargar la operación Día D."); });
    return () => { cancelled = true; };
  }, [campaign_id]);
  const fiscalContacts = useMemo(() => contacts.filter((person) => /fiscal/i.test(`${person.contact_type} ${person.role ?? ""}`)), [contacts]);
  const selectedCenter = centers.find((center) => center.id === selectedCenterId) ?? centers[0];
  const selectedCenterJrvs = selectedCenter ? jrvNumbers(selectedCenter.jrvRange, selectedCenter.jrv) : [];
  const assignmentRows = assignments.filter((record) => record.category === "ASIGNACION_JRV");
  const assignmentFor = (centerId: string, jrv: number | string) => assignmentRows.find((record) => String(record.payload.center_id) === centerId && String(record.payload.jrv) === String(jrv));
  const assignmentsForCenter = (centerId: string) => assignmentRows.filter((record) => String(record.payload.center_id) === centerId);
  const centerResponsible = (centerId: string) => {
    const assignment = assignmentsForCenter(centerId).find((record) => record.payload.center_responsible_name || record.payload.center_responsible_id);
    return assignment ? String(assignment.payload.center_responsible_name || "Responsable asignado") : "";
  };
  async function saveAssignment(event: FormEvent) {
    event.preventDefault(); if (!campaign_id || !selectedCenter || !selectedJrv || !fiscalId) return;
    setSaving(true); setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const fiscal = fiscalContacts.find((person) => person.id === fiscalId);
      const responsible = contacts.find((person) => person.id === centerResponsibleId);
      const current = assignmentFor(selectedCenter.id, selectedJrv);
      const saved = await saveCampaignRecord(campaign_id, { module_key: "dia-d", category: "ASIGNACION_JRV", title: `${selectedCenter.name} · JRV ${selectedJrv}`, details: fiscal?.full_name || null, status: "ASIGNADO", payload: { center_id: selectedCenter.id, center_name: selectedCenter.name, center_reference: centerReference(selectedCenter.id), jrv: Number(selectedJrv), fiscal_id: fiscalId, fiscal_name: fiscal?.full_name || "", center_responsible_id: centerResponsibleId || null, center_responsible_name: responsible?.full_name || null } }, token, current?.id ?? null);
      setAssignments((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]); setMessage(`JRV ${selectedJrv} asignada a ${fiscal?.full_name || "fiscal"}.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar la asignación."); } finally { setSaving(false); }
  }
  async function removeAssignment(record: CampaignModuleRecord) {
    if (!campaign_id) return;
    try { const token = await ensureRadarAccessToken(); await deleteCampaignRecord(campaign_id, record.id, token); setAssignments((rows) => rows.filter((item) => item.id !== record.id)); setMessage("Asignación eliminada."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo eliminar la asignación."); }
  }
  const openCenter = centers.find((center) => center.id === centerOpen) ?? null;
  const mando = (
    <section className="day-d-command">
      <header>
        <small>JORNADA ELECTORAL</small>
        <h2>Centro de mando</h2>
      </header>
      <div className="day-d-summary">
        <button type="button" onClick={() => openDayDView("centros")}>
          <small>Centros de votación</small>
          <b>{centers.length}</b>
          <span>Abrir organización →</span>
        </button>
        <button type="button" onClick={() => openDayDView("centros")}>
          <small>JRV de referencia</small>
          <b>{totalJrv}</b>
          <span>Revisar cobertura →</span>
        </button>
        <button type="button" onClick={() => openDayDView("fiscales")}>
          <small>Fiscales en CRM</small>
          <b>{fiscalContacts.length}</b>
          <span>Ver supervisión →</span>
        </button>
        <button type="button" onClick={() => openDayDView("incidencias")}>
          <small>Incidencias abiertas</small>
          <b>0</b>
          <span>Abrir incidencias →</span>
        </button>
      </div>
    </section>
  );
  const centerView = (
    <section className="day-d-workspace">
      <header>
        <div>
          <small>COBERTURA TSE</small>
          <h2>Centros de votación y JRV</h2>
          <p>
            Organización territorial y asignación de responsables y fiscales.
          </p>
        </div>
      </header>
      <form className="day-d-assignment-form" onSubmit={saveAssignment}>
        <header>
          <div>
            <small>ASIGNACIÓN OPERATIVA</small>
            <h3>Asignar centro, responsable y JRV</h3>
          </div>
        </header>
        {!fiscalContacts.length ? <p className="day-d-form-warning">Primero marca a una persona como Fiscal en el CRM.</p> : null}
        {message ? <p className="agenda-message" role="status">{message}</p> : null}
        <div>
          <label>
            <span>Centro de votación</span>
            <select value={selectedCenterId} onChange={(event) => { setSelectedCenterId(event.target.value); setSelectedJrv(""); }}>
              {centers.map((center) => (
                <option value={center.id} key={center.id}>
                  {center.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Responsable del centro</span>
            <select value={centerResponsibleId} onChange={(event) => setCenterResponsibleId(event.target.value)}>
              <option value="">Responsable del CRM…</option>
              {contacts.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.role ? ` · ${person.role}` : ""}</option>)}
            </select>
          </label>
          <label>
            <span>JRV del centro</span>
            <select value={selectedJrv} onChange={(event) => { setSelectedJrv(event.target.value); const current = selectedCenter ? assignmentFor(selectedCenter.id, event.target.value) : undefined; setFiscalId(current ? String(current.payload.fiscal_id || "") : ""); }}>
              <option value="">Seleccionar…</option>
              {selectedCenterJrvs.map((jrv) => <option key={jrv} value={jrv}>JRV {jrv}</option>)}
            </select>
          </label>
          <label>
            <span>Fiscal de la JRV</span>
            <select value={fiscalId} onChange={(event) => setFiscalId(event.target.value)}>
              <option value="">Fiscal del CRM…</option>
              {fiscalContacts.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.community ? ` · ${person.community}` : ""}</option>)}
            </select>
          </label>
          <button disabled={saving || !selectedCenterId || !selectedJrv || !fiscalId}>{saving ? "Guardando…" : "Guardar asignación"}</button>
        </div>
      </form>
      <div className="day-d-center-list">
        {centers.map((center) => (
          <article key={center.id}>
            <span>
              <small>REFERENCIA RADAR · {centerReference(center.id)}</small>
              <button type="button" onClick={() => setCenterOpen(center.id)}>{center.name}</button>
              <em>{centerCem(center.community)}</em>
            </span>
            <strong>
              {assignmentsForCenter(center.id).length}/{center.jrv} JRV con fiscal ·{" "}
              {(center.voters ?? 0).toLocaleString("es-GT")} electores
            </strong>
            <small>JRV {center.jrvRange}</small>
          </article>
        ))}
      </div>
      {openCenter ? <div className="agenda-modal" role="dialog" aria-modal="true">
        <section className="day-d-center-modal">
          <header><div><small>CENTRO DE VOTACIÓN · {centerReference(openCenter.id)}</small><h2>{openCenter.name}</h2><p>{centerCem(openCenter.community)} · JRV {openCenter.jrvRange}</p></div><button type="button" onClick={() => setCenterOpen(null)}>×</button></header>
          <div className="day-d-center-modal-summary"><span><small>Responsable</small><b>{centerResponsible(openCenter.id) || "Sin asignar"}</b></span><span><small>JRV con fiscal</small><b>{assignmentsForCenter(openCenter.id).length} de {openCenter.jrv}</b></span><span><small>Pendientes</small><b>{Math.max(openCenter.jrv - assignmentsForCenter(openCenter.id).length, 0)}</b></span><span><small>Electores 2023</small><b>{(openCenter.voters ?? 0).toLocaleString("es-GT")}</b></span></div>
          <div className="day-d-center-jrv-list"><div className="head"><span>JRV</span><span>Fiscal asignado</span><span>Estado</span><span>Acciones</span></div>{jrvNumbers(openCenter.jrvRange, openCenter.jrv).map((jrv) => { const assignment = assignmentFor(openCenter.id, jrv); return <article key={jrv}><b>{jrv}</b><span>{assignment ? String(assignment.payload.fiscal_name || assignment.details || "Fiscal") : "Sin fiscal asignado"}</span><em className={assignment ? "assigned" : "pending"}>{assignment ? "ASIGNADA" : "PENDIENTE"}</em><nav><button type="button" onClick={() => { setSelectedCenterId(openCenter.id); setSelectedJrv(String(jrv)); setFiscalId(assignment ? String(assignment.payload.fiscal_id || "") : ""); setCenterOpen(null); }}>Asignar</button>{assignment ? <button className="danger" type="button" onClick={() => void removeAssignment(assignment)}>Quitar</button> : null}</nav></article>; })}</div>
          <footer><span>Las asignaciones también aparecen en el carnet del fiscal.</span><Link to={`/municipio/${municipality_code}/mapa`}>Ver centro en el mapa</Link></footer>
        </section>
      </div> : null}
    </section>
  );
  const fiscales = (
    <section className="day-d-workspace">
      <header>
        <div>
          <small>SUPERVISIÓN CASI EN TIEMPO REAL</small>
          <h2>Fiscales</h2>
          <p>
            Estados enviados desde el portal ligero. El alcance se deriva de la
            sesión fiscal, nunca de IDs escritos en el navegador.
          </p>
        </div>
        <a
          className="day-d-open-fiscal"
          href="https://radar-portal-fiscal.carlos-mencos.chatgpt.site"
          target="_blank"
          rel="noreferrer"
        >
          Abrir portal fiscal público
        </a>
      </header>
      <div className="day-d-operations-strip">
        <span>
          <small>JRV con fiscal</small>
          <b>{assignmentRows.length}/{totalJrv}</b>
        </span>
        <span>
          <small>Check-in completados</small>
          <b>0</b>
        </span>
        <span>
          <small>Necesitan apoyo</small>
          <b>0</b>
        </span>
        <span>
          <small>RTD ingresado</small>
          <b>0</b>
        </span>
      </div>
      <div className="day-d-filters">
        <label>
          <span>Centro</span>
          <select>
            <option>Todos</option>
            {centers.map((center) => (
              <option key={center.id}>{center.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Mostrar pendientes</span>
          <select>
            <option>Todos</option>
            <option>Sin check-in</option>
            <option>Sin cierre</option>
            <option>Sin transporte</option>
            <option>Sin comida</option>
            <option>Sin datos</option>
            <option>Necesita apoyo</option>
            <option>Sin RTD</option>
          </select>
        </label>
      </div>
      <div className="day-d-fiscal-table extended">
        <div className="head">
          <span>Fiscal / asignación</span>
          <span>Check-in</span>
          <span>Transporte</span>
          <span>Comida</span>
          <span>Datos</span>
          <span>Cierre</span>
          <span>RTD</span>
          <span>Acceso / sincronización</span>
        </div>
        {assignmentRows.length ? assignmentRows.map((record) => <article key={record.id}><span><b>{String(record.payload.fiscal_name || record.details || "Fiscal")}</b><small>{String(record.payload.center_name || "Centro")} · JRV {String(record.payload.jrv || "—")}</small></span><em>PENDIENTE</em><em>—</em><em>—</em><em>—</em><em>—</em><em>—</em><button type="button" onClick={() => { setCenterOpen(String(record.payload.center_id || "")); openDayDView("centros"); }}>Abrir</button></article>) : <p>No hay fiscales con este filtro.</p>}
      </div>
    </section>
  );
  const incidencias = (
    <section className="day-d-workspace">
      <header>
        <div>
          <small>ALERTA, EVIDENCIA Y RESPUESTA</small>
          <h2>Incidencias</h2>
          <p>
            Registros normalizados con folio, archivos privados, acciones e
            historial. La evidencia del fiscal no se elimina.
          </p>
        </div>
      </header>
      <div className="day-d-filters">
        <label>
          <span>Estado</span>
          <select>
            <option>ABIERTAS</option>
            <option>RESUELTAS</option>
            <option>TODAS</option>
          </select>
        </label>
      </div>
      <div className="day-d-incident-list">
        <p>No hay incidencias con este filtro.</p>
      </div>
    </section>
  );
  const logistica = (
    <section className="day-d-workspace day-d-logistics-workspace">
      <header>
        <div>
          <small>PREPARACIÓN Y RESPUESTA DÍA D</small>
          <h2>Logística</h2>
          <p>
            Rutas, transporte, alimentación, datos y kits coordinados desde una
            sola orden operativa.
          </p>
        </div>
        <nav className="day-d-logistics-links">
          <Link to={`/municipio/${municipality_code}/recursos`}>
            Vehículos y recursos
          </Link>
          <Link to={`/municipio/${municipality_code}/recursos`}>+ Nueva previsión</Link>
        </nav>
      </header>
      <div className="logistics-summary">
        <span>
          <small>Rutas / traslados</small>
          <b>0</b>
        </span>
        <span>
          <small>Personas o porciones previstas</small>
          <b>0</b>
        </span>
        <span>
          <small>Recargas planificadas</small>
          <b>0</b>
        </span>
        <span className="ready">
          <small>Pendientes o incidencias</small>
          <b>0</b>
        </span>
        <span>
          <small>Costo estimado</small>
          <b>Q 0.00</b>
        </span>
      </div>
      <div className="logistics-start-grid">
        {[
          "Transporte electores",
          "Traslado fiscales",
          "Alimentación",
          "Datos móviles",
          "Kit electoral",
          "Equipo respaldo",
        ].map((item) => (
          <Link key={item} to={`/municipio/${municipality_code}/recursos`}>
            <b>+</b>
            <span>{item}</span>
            <small>Preparar operación</small>
          </Link>
        ))}
      </div>
    </section>
  );
  const rtd = (
    <section className="day-d-workspace rtd-workspace">
      <header>
        <div>
          <small>RESULTADOS PARCIALES PROPIOS</small>
          <h2>Recepción Temprana de Datos</h2>
          <p>
            Un folio vigente por municipio + campaña + JRV + elección.
            Fotografía, digitación y correcciones viven en el mismo expediente.
          </p>
        </div>
        <span className="rtd-live">CONTROL PROPIO · RESULTADOS PRELIMINARES NO OFICIALES</span>
      </header>
      <aside className="rtd-catalog-note"><b>Participantes oficiales precargados</b><span>RADAR utilizará el catálogo electoral oficial validado para que cada fiscal vea únicamente las opciones que corresponden a su tipo de elección.</span></aside>
      <div className="rtd-controlbar">
        <label><span>Datos mostrados</span><select defaultValue="REAL"><option value="REAL">Resultados reales Día D</option><option value="DEMO">Validación demostrativa</option></select></label>
        <label><span>Tipo de elección</span><select defaultValue="CORPORACION_MUNICIPAL"><option value="PRESIDENTE">Presidente y Vicepresidente</option><option value="CORPORACION_MUNICIPAL">Corporación Municipal</option><option value="DIPUTADOS_DISTRITO">Diputados por distrito</option><option value="DIPUTADOS_NACIONAL">Listado nacional</option><option value="PARLACEN">Parlamento Centroamericano</option></select></label>
        <span><small>Lectura permitida</small><b>Mayoría relativa; concejalías sujetas a regla legal</b></span>
      </div>
      <div className="rtd-progress-card">
        <header><span><small>JRV con RTD recibido · JRV reales recibidas</small><b>0 de {totalJrv}</b></span><strong>0%</strong></header>
        <div><i style={{ width: "0%" }} /></div>
      </div>
      <div className="rtd-results">
        <section><header><small>GRÁFICA DE RESULTADOS · RESULTADO PARCIAL REAL</small><h3>Corporación Municipal</h3></header><p>No hay folios enviados para esta elección en el modo seleccionado.</p></section>
        <aside><small>CONTROL DE RECEPCIÓN</small><span><b>0</b> folios reales enviados</span><span><b>0</b> folios demostrativos</span><span><b>0</b> borradores en servidor</span><span><b>0</b> con acta</span><span><b>0</b> observados</span><span><b>0</b> corregidos</span><p>Los folios demo nunca se suman a resultados reales. Los borradores tampoco cuentan como cobertura.</p></aside>
      </div>
      <div className="day-d-filters">
        <label><span>Centro</span><select><option>Todos</option>{centers.map((center) => <option key={center.id}>{center.name}</option>)}</select></label>
        <label><span>Estado</span><select><option>Todos</option><option>BORRADOR</option><option>PENDIENTE REVISION</option><option>OBSERVADO</option><option>VALIDADO</option><option>CORREGIDO</option></select></label>
        <label><span>JRV</span><input inputMode="numeric" placeholder="Buscar JRV" /></label>
      </div>
      <div className="day-d-rtd-list">
        <p>No hay folios para estos filtros.</p>
      </div>
    </section>
  );
  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>COORDINACIÓN</p>
          <h1>Día D</h1>
          <span>
            Centro de mando, fiscales, movilización, incidencias y reportes
          </span>
        </div>
      </section>
      <InternalViews
        views={[
          { key: "mando", label: "Centro de mando", content: mando },
          {
            key: "centros",
            label: "Centros de votación y JRV",
            content: centerView,
          },
          { key: "fiscales", label: "Fiscales", content: fiscales },
          { key: "incidencias", label: "Incidencias", content: incidencias },
          { key: "logistica", label: "Logística", content: logistica },
          { key: "rtd", label: "RTD", content: rtd },
        ]}
      />
    </>
  );
}

export function V70DirectDayD0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="dia-d"
        eyebrow="OPERACIÓN ELECTORAL"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <DayDContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
