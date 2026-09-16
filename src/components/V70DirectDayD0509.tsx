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

const logisticsCategories = [
  ["TRANSPORTE_ELECTORES", "Movilización de electores", "Comunidades → centros"],
  ["TRASLADO_FISCALES", "Movilización de fiscales", "Pilotos, vehículos y horarios"],
  ["TRANSPORTE_RECURSOS", "Transporte de recursos", "Materiales y equipos"],
  ["OTRO_TRANSPORTE", "Otro transporte", "Ruta o traslado especial"],
  ["ALIMENTACION", "Alimentación", "Tiempos, personas y entrega"],
  ["DATOS_MOVILES", "Datos móviles", "Número, monto y responsable"],
  ["KIT_ELECTORAL", "Kits electorales", "Material de cada fiscal"],
  ["EQUIPO_CENTRO", "Equipo del centro", "Equipo por centro de votación"],
  ["OTRA_PREVISION", "Otra previsión", "Necesidad operativa adicional"],
] as const;
const logisticsEntryGroups = [
  ["TRANSPORTE_ELECTORES", "Transporte", "Rutas, vehículos y horarios"],
  ["ALIMENTACION", "Alimentación", "Tiempos, porciones y entrega"],
  ["DATOS_MOVILES", "Datos móviles", "Fiscal, empresa, monto y fecha"],
  ["KIT_ELECTORAL", "Kits electorales", "Material para cada fiscal"],
  ["EQUIPO_CENTRO", "Equipo de centros de votación", "Respaldo operativo por centro"],
  ["OTRA_PREVISION", "Otros", "Cualquier previsión adicional"],
] as const;
const transportCategories = ["TRANSPORTE_ELECTORES", "TRASLADO_FISCALES", "TRANSPORTE_RECURSOS", "OTRO_TRANSPORTE"];
const logisticsChecklists: Record<string, string[]> = {
  KIT_ELECTORAL: ["Credencial", "Tabla de apoyo", "Lapiceros", "Marcadores", "Cinta adhesiva", "Batería externa", "Agua", "Contactos de emergencia"],
  EQUIPO_CENTRO: ["Cargadores y power banks", "Botiquín", "Agua", "Linternas", "Extensiones eléctricas", "Copias de contactos y JRV", "Cinta adhesiva y marcadores", "Bolsas impermeables", "Baterías de respaldo"],
};

function accessCode() {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
}

function dayDMark(value: unknown, label: string) {
  return (
    <span
      className={value ? "day-d-check yes" : "day-d-check no"}
      title={label}
      aria-label={`${label}: ${value ? "sí" : "no"}`}
    >
      {value ? "✓" : "×"}
    </span>
  );
}
const rtdElectionTypes = [
  ["PRESIDENTE", "Presidente"],
  ["CORPORACION_MUNICIPAL", "Corporación Municipal"],
  ["DIPUTADOS_DISTRITO", "Diputados distritales"],
  ["DIPUTADOS_NACIONAL", "Listado nacional"],
  ["PARLACEN", "Parlacen"],
] as const;
function rtdElectionReceived(record: CampaignModuleRecord, election: string) {
  const value = record.payload.rtd_elections ?? record.payload.actas_uploaded ?? record.payload.elections_received;
  if (Array.isArray(value)) return value.map(String).includes(election);
  if (value && typeof value === "object") return Boolean((value as Record<string, unknown>)[election]);
  return false;
}
function rtdActaProgress(record: CampaignModuleRecord) {
  return <span className="day-d-actas-progress" aria-label="Estado de las cinco actas">{rtdElectionTypes.map(([key, label]) => {
    const received = rtdElectionReceived(record, key);
    return <i className={received ? "received" : "pending"} title={`${label}: ${received ? "recibida" : "pendiente"}`} key={key} />;
  })}</span>;
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
  const [resources, setResources] = useState<CampaignModuleRecord[]>([]);
  const [financeRecords, setFinanceRecords] = useState<CampaignModuleRecord[]>([]);
  const [selectedCenterId, setSelectedCenterId] = useState("");
  const [centerResponsibleId, setCenterResponsibleId] = useState("");
  const [selectedJrv, setSelectedJrv] = useState("");
  const [fiscalId, setFiscalId] = useState("");
  const [centerOpen, setCenterOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [centerFilter, setCenterFilter] = useState("all");
  const [pendingFilter, setPendingFilter] = useState("all");
  const [issuedAccess, setIssuedAccess] = useState<null | {
    link: string;
    code: string;
    name: string;
    jrv: string;
  }>(null);
  const [busyAccess, setBusyAccess] = useState("");
  const [logisticsOpen, setLogisticsOpen] = useState(false);
  const [editingLogistics, setEditingLogistics] = useState<string | null>(null);
  const [logisticsFilter, setLogisticsFilter] = useState("all");
  const [logisticsCenterFilter, setLogisticsCenterFilter] = useState("all");
  const [logisticsStatusFilter, setLogisticsStatusFilter] = useState("all");
  const [logisticsForm, setLogisticsForm] = useState({
    category: "TRANSPORTE_ELECTORES",
    title: "",
    center_id: "",
    responsible_id: "",
    scheduled_at: "",
    quantity: "",
    estimated_cost: "",
    status: "PLANIFICADO",
    community: "",
    driver_id: "",
    supplier_id: "",
    beneficiary_id: "",
    resource_record_id: "",
    budget_record_id: "",
    capacity: "",
    departure_at: "",
    return_at: "",
    meal_times: "",
    characteristics: "",
    recipients: "",
    delivery_method: "",
    mobile_carrier: "TIGO",
    recharge_at: "",
    recharge_amount: "",
    checklist: [] as string[],
    generic_elements: "",
    route_notes: "",
    notes: "",
  });
  useEffect(() => { if (!selectedCenterId && centers[0]) setSelectedCenterId(centers[0].id); }, [centers, selectedCenterId]);
  useEffect(() => {
    let cancelled = false; if (!campaign_id) return;
    void ensureRadarAccessToken().then(async (token) => Promise.all([loadCampaignContacts(campaign_id, token), loadCampaignRecords(campaign_id, "dia-d", token), loadCampaignRecords(campaign_id, "recursos", token), loadCampaignRecords(campaign_id, "finanzas", token)]))
      .then(([people, records, resourceRecords, financialRecords]) => { if (!cancelled) { setContacts(people ?? []); setAssignments(records ?? []); setResources(resourceRecords ?? []); setFinanceRecords(financialRecords ?? []); } })
      .catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "No se pudo cargar la operación Día D."); });
    return () => { cancelled = true; };
  }, [campaign_id]);
  const fiscalContacts = useMemo(() => contacts.filter((person) => /fiscal/i.test(`${person.contact_type} ${person.role ?? ""}`)), [contacts]);
  const selectedCenter = centers.find((center) => center.id === selectedCenterId) ?? centers[0];
  const selectedCenterJrvs = selectedCenter ? jrvNumbers(selectedCenter.jrvRange, selectedCenter.jrv) : [];
  const assignmentRows = assignments.filter((record) => record.category === "ASIGNACION_JRV");
  const accessRows = assignments.filter((record) => record.category === "ACCESO_FISCAL");
  const logisticsRows = assignments.filter((record) => record.category === "LOGISTICA");
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
      const responsible = fiscalContacts.find((person) => person.id === centerResponsibleId);
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
  const grantFor = (assignmentId: string) =>
    accessRows.find(
      (record) =>
        String(record.payload.assignment_id || "") === assignmentId &&
        record.status === "ACTIVO",
    );
  async function generateAccess(assignment: CampaignModuleRecord) {
    if (!campaign_id) return;
    setBusyAccess(assignment.id);
    setMessage("");
    try {
      const code = accessCode();
      const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
      const token = await ensureRadarAccessToken();
      const current = grantFor(assignment.id);
      const saved = await saveCampaignRecord(
        campaign_id,
        {
          module_key: "dia-d",
          category: "ACCESO_FISCAL",
          title: `Acceso · ${String(assignment.payload.fiscal_name || "Fiscal")} · JRV ${String(assignment.payload.jrv || "—")}`,
          details: "Acceso individual al portal fiscal",
          status: "ACTIVO",
          payload: {
            assignment_id: assignment.id,
            fiscal_id: assignment.payload.fiscal_id,
            center_id: assignment.payload.center_id,
            jrv: assignment.payload.jrv,
            code,
            expires_at: expiresAt,
            issued_at: new Date().toISOString(),
          },
        },
        token,
        current?.id ?? null,
      );
      setAssignments((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]);
      const link = `https://radar-portal-fiscal.carlos-mencos.chatgpt.site/?code=${encodeURIComponent(code)}`;
      setIssuedAccess({
        link,
        code,
        name: String(assignment.payload.fiscal_name || "Fiscal"),
        jrv: String(assignment.payload.jrv || "—"),
      });
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo generar el acceso.");
    } finally {
      setBusyAccess("");
    }
  }
  async function changeGrantStatus(grant: CampaignModuleRecord, status: "SUSPENDIDO" | "REVOCADO") {
    if (!campaign_id) return;
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignRecord(campaign_id, { module_key: "dia-d", category: grant.category, title: grant.title, details: grant.details, status, payload: { ...grant.payload, status_changed_at: new Date().toISOString() } }, token, grant.id);
      setAssignments((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]);
      setMessage(status === "SUSPENDIDO" ? "Acceso suspendido." : "Acceso revocado.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo actualizar el acceso."); }
  }
  function beginLogistics(category = "TRANSPORTE_ELECTORES") {
    setEditingLogistics(null);
    setLogisticsForm({ category, title: "", center_id: "", responsible_id: "", scheduled_at: "", quantity: "", estimated_cost: "", status: "PLANIFICADO", community: "", driver_id: "", supplier_id: "", beneficiary_id: "", resource_record_id: "", budget_record_id: "", capacity: "", departure_at: "", return_at: "", meal_times: "", characteristics: "", recipients: "", delivery_method: "", mobile_carrier: "TIGO", recharge_at: "", recharge_amount: "", checklist: [...(logisticsChecklists[category] ?? [])], generic_elements: "", route_notes: "", notes: "" });
    setLogisticsOpen(true);
  }
  function editLogistics(record: CampaignModuleRecord) {
    setEditingLogistics(record.id);
    setLogisticsForm({
      category: String(record.payload.category || "TRANSPORTE_ELECTORES"),
      title: record.title,
      center_id: String(record.payload.center_id || ""),
      responsible_id: String(record.payload.responsible_id || ""),
      scheduled_at: String(record.payload.scheduled_at || "").slice(0, 16),
      quantity: String(record.payload.quantity || ""),
      estimated_cost: String(record.payload.estimated_cost || ""),
      status: record.status,
      community: String(record.payload.community || ""),
      driver_id: String(record.payload.driver_id || ""),
      supplier_id: String(record.payload.supplier_id || ""),
      beneficiary_id: String(record.payload.beneficiary_id || ""),
      resource_record_id: String(record.payload.resource_record_id || ""),
      budget_record_id: String(record.payload.budget_record_id || ""),
      capacity: String(record.payload.capacity || ""),
      departure_at: String(record.payload.departure_at || ""),
      return_at: String(record.payload.return_at || ""),
      meal_times: String(record.payload.meal_times || ""),
      characteristics: String(record.payload.characteristics || ""),
      recipients: String(record.payload.recipients || ""),
      delivery_method: String(record.payload.delivery_method || ""),
      mobile_carrier: String(record.payload.mobile_carrier || "TIGO"),
      recharge_at: String(record.payload.recharge_at || "").slice(0, 16),
      recharge_amount: String(record.payload.recharge_amount || ""),
      checklist: Array.isArray(record.payload.checklist) ? record.payload.checklist.map(String) : [],
      generic_elements: Array.isArray(record.payload.generic_elements) ? record.payload.generic_elements.join(", ") : String(record.payload.generic_elements || ""),
      route_notes: String(record.payload.route_notes || ""),
      notes: record.details || "",
    });
    setLogisticsOpen(true);
  }
  async function saveLogistics(event: FormEvent) {
    event.preventDefault();
    if (!campaign_id) return;
    setSaving(true); setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const center = centers.find((item) => item.id === logisticsForm.center_id);
      const responsible = contacts.find((item) => item.id === logisticsForm.responsible_id);
      const saved = await saveCampaignRecord(campaign_id, {
        module_key: "dia-d", category: "LOGISTICA",
        title: logisticsForm.title.trim() || logisticsCategories.find(([key]) => key === logisticsForm.category)?.[1] || "Previsión logística",
        details: logisticsForm.notes || null, status: logisticsForm.status,
        payload: { ...logisticsForm, quantity: Number(logisticsForm.quantity || 0), estimated_cost: Number(logisticsForm.estimated_cost || 0), capacity: Number(logisticsForm.capacity || 0), recharge_amount: Number(logisticsForm.recharge_amount || 0), generic_elements: logisticsForm.generic_elements.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean), center_name: center?.name || null, responsible_name: responsible?.full_name || null, driver_name: contacts.find((item) => item.id === logisticsForm.driver_id)?.full_name || null, supplier_name: contacts.find((item) => item.id === logisticsForm.supplier_id)?.full_name || null, beneficiary_name: contacts.find((item) => item.id === logisticsForm.beneficiary_id)?.full_name || null },
      }, token, editingLogistics);
      setAssignments((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]);
      setLogisticsOpen(false); setEditingLogistics(null); setMessage("Previsión logística guardada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar la previsión."); }
    finally { setSaving(false); }
  }
  async function removeLogistics(record: CampaignModuleRecord) {
    if (!campaign_id || !window.confirm(`¿Eliminar “${record.title}”?`)) return;
    try { const token = await ensureRadarAccessToken(); await deleteCampaignRecord(campaign_id, record.id, token); setAssignments((rows) => rows.filter((item) => item.id !== record.id)); setMessage("Previsión eliminada."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo eliminar la previsión."); }
  }
  const visibleFiscalRows = assignmentRows
    .filter((record) => centerFilter === "all" || String(record.payload.center_id || "") === centerFilter)
    .filter((record) => {
      if (pendingFilter === "all") return true;
      if (pendingFilter === "checkin") return !record.payload.checked_in;
      if (pendingFilter === "cierre") return !record.payload.table_closed;
      if (pendingFilter === "transporte") return !record.payload.transport_ready;
      if (pendingFilter === "comida") return !record.payload.food_ready;
      if (pendingFilter === "datos") return !record.payload.mobile_data_ready;
      if (pendingFilter === "apoyo") return Boolean(record.payload.support_needed);
      if (pendingFilter === "rtd") return !record.payload.rtd_submitted;
      return true;
    });
  const visibleLogisticsRows = logisticsRows.filter((record) => {
    const category = String(record.payload.category || "");
    return (logisticsFilter === "all" || category === logisticsFilter) &&
      (logisticsCenterFilter === "all" || String(record.payload.center_id || "") === logisticsCenterFilter) &&
      (logisticsStatusFilter === "all" || record.status === logisticsStatusFilter);
  });
  const transportPlans = logisticsRows.filter((record) => ["TRANSPORTE_ELECTORES", "TRASLADO_FISCALES"].includes(String(record.payload.category || "")));
  const logisticsQuantity = logisticsRows.reduce((sum, record) => sum + Number(record.payload.quantity || 0), 0);
  const plannedRecharges = logisticsRows.filter((record) => record.payload.category === "DATOS_MOVILES").length;
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
              {fiscalContacts.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.community ? ` · ${person.community}` : ""}</option>)}
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
          <small>SUPERVISIÓN EN TIEMPO REAL</small>
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
          <b>{assignmentRows.filter((record) => record.payload.checked_in).length}</b>
        </span>
        <span>
          <small>Necesitan apoyo</small>
          <b>{assignmentRows.filter((record) => record.payload.support_needed).length}</b>
        </span>
        <span>
          <small>RTD ingresado</small>
          <b>{assignmentRows.filter((record) => record.payload.rtd_submitted).length}</b>
        </span>
      </div>
      <div className="day-d-filters">
        <label>
          <span>Centro</span>
          <select value={centerFilter} onChange={(event) => setCenterFilter(event.target.value)}>
            <option value="all">Todos</option>
            {centers.map((center) => (
              <option value={center.id} key={center.id}>{center.name}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Mostrar pendientes</span>
          <select value={pendingFilter} onChange={(event) => setPendingFilter(event.target.value)}>
            <option value="all">Todos</option>
            <option value="checkin">Sin check-in</option>
            <option value="cierre">Sin cierre</option>
            <option value="transporte">Sin transporte</option>
            <option value="comida">Sin comida</option>
            <option value="datos">Sin datos</option>
            <option value="apoyo">Necesita apoyo</option>
            <option value="rtd">Sin RTD</option>
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
          <span>5 actas RTD</span>
          <span>Acceso / sincronización</span>
        </div>
        {visibleFiscalRows.length ? visibleFiscalRows.map((record) => { const grant = grantFor(record.id); return <article key={record.id}><span><Link className="day-d-person-link" to={`/municipio/${municipality_code}/directorio?view=team&personId=${encodeURIComponent(String(record.payload.fiscal_id || ""))}`}>{String(record.payload.fiscal_name || record.details || "Fiscal")}</Link><small>{String(record.payload.center_name || "Centro")} · JRV {String(record.payload.jrv || "—")}</small>{record.payload.support_needed ? <em className="day-d-support-alert">Necesita apoyo</em> : null}</span>{dayDMark(record.payload.checked_in, "Check-in")}{dayDMark(record.payload.transport_ready, "Transporte")}{dayDMark(record.payload.food_ready, "Comida")}{dayDMark(record.payload.mobile_data_ready, "Datos")}{dayDMark(record.payload.table_closed, "Cierre")}{rtdActaProgress(record)}<span className="day-d-access-actions"><small>{record.payload.last_fiscal_sync_at ? `Sincronizado ${new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(record.payload.last_fiscal_sync_at)))}` : "Sin actividad fiscal"}</small>{grant ? <><b>Acceso activo · vence {new Intl.DateTimeFormat("es-GT", { dateStyle: "short", timeStyle: "short" }).format(new Date(String(grant.payload.expires_at)))}</b><nav><button type="button" disabled={busyAccess === record.id} onClick={() => void generateAccess(record)}>{busyAccess === record.id ? "Generando…" : "Regenerar"}</button><button type="button" onClick={() => void changeGrantStatus(grant, "SUSPENDIDO")}>Suspender</button><button className="danger" type="button" onClick={() => void changeGrantStatus(grant, "REVOCADO")}>Revocar</button></nav></> : <button type="button" disabled={busyAccess === record.id} onClick={() => void generateAccess(record)}>{busyAccess === record.id ? "Generando…" : "Generar acceso"}</button>}</span></article>; }) : <p>No hay fiscales con este filtro.</p>}
      </div>
      {issuedAccess ? <div className="agenda-modal" role="dialog" aria-modal="true"><section className="day-d-access-modal"><header><div><small>ACCESO GENERADO · SE MUESTRA UNA VEZ</small><h2>{issuedAccess.name} · JRV {issuedAccess.jrv}</h2></div><button type="button" onClick={() => setIssuedAccess(null)}>×</button></header><label><span>Enlace individual</span><input readOnly value={issuedAccess.link} /></label><label><span>Código alterno</span><strong>{issuedAccess.code}</strong></label><p>Comparte este acceso únicamente con el fiscal asignado.</p><footer><button type="button" onClick={() => void navigator.clipboard.writeText(`RADAR Portal Fiscal\n${issuedAccess.name} · JRV ${issuedAccess.jrv}\n${issuedAccess.link}\nCódigo alterno: ${issuedAccess.code}`)}>Copiar acceso</button><a href={`https://wa.me/?text=${encodeURIComponent(`RADAR Portal Fiscal\n${issuedAccess.name} · JRV ${issuedAccess.jrv}\n${issuedAccess.link}\nCódigo alterno: ${issuedAccess.code}`)}`} target="_blank" rel="noreferrer">Compartir por WhatsApp</a></footer></section></div> : null}
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
          <Link to={`/municipio/${municipality_code}/estrategia-finanzas`}>Control financiero</Link>
          <button type="button" onClick={() => beginLogistics()}>+ Nueva previsión</button>
        </nav>
      </header>
      <div className="logistics-summary">
        <span>
          <small>Rutas / traslados</small>
          <b>{transportPlans.length}</b>
        </span>
        <span>
          <small>Personas o porciones previstas</small>
          <b>{logisticsQuantity}</b>
        </span>
        <span>
          <small>Recargas planificadas</small>
          <b>{plannedRecharges}</b>
        </span>
      </div>
      <div className="logistics-start-grid">
        {logisticsEntryGroups.map(([category, label, detail]) => (
          <button type="button" key={category} onClick={() => beginLogistics(category)}>
            <b>+</b>
            <span>{label}</span>
            <small>{detail}</small>
          </button>
        ))}
      </div>
      {message ? <p className="agenda-message" role="status">{message}</p> : null}
      <div className="day-d-filters logistics-filters"><label><span>Tipo</span><select value={logisticsFilter} onChange={(event) => setLogisticsFilter(event.target.value)}><option value="all">Todos</option>{logisticsCategories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label><span>Centro</span><select value={logisticsCenterFilter} onChange={(event) => setLogisticsCenterFilter(event.target.value)}><option value="all">Todos</option>{centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label><label><span>Estado</span><select value={logisticsStatusFilter} onChange={(event) => setLogisticsStatusFilter(event.target.value)}><option value="all">Todos</option><option>PLANIFICADO</option><option>EN_PROCESO</option><option>CONCLUIDO</option></select></label></div>
      <div className="logistics-plan-list">{visibleLogisticsRows.length ? visibleLogisticsRows.map((record) => <article key={record.id}><header><span><small>{logisticsCategories.find(([key]) => key === record.payload.category)?.[1] || "PREVISIÓN"}</small><b>{record.title}</b><em>{String(record.payload.center_name || "Cobertura general")}</em></span><strong className={record.status.toLocaleLowerCase("es")}>{record.status.replaceAll("_", " ")}</strong></header><div className="logistics-plan-facts"><span><small>Responsable</small><b>{String(record.payload.responsible_name || "Sin asignar")}</b></span><span><small>Fecha</small><b>{record.payload.scheduled_at ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(record.payload.scheduled_at))) : "Sin programar"}</b></span><span><small>Cantidad</small><b>{String(record.payload.quantity || 0)}</b></span><span><small>Costo estimado</small><b>{new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(Number(record.payload.estimated_cost || 0))}</b></span></div>{record.details ? <p>{record.details}</p> : null}<footer><span /><button type="button" onClick={() => editLogistics(record)}>Editar</button><button className="danger" type="button" onClick={() => void removeLogistics(record)}>Eliminar</button></footer></article>) : <div className="agenda-empty"><b>No hay previsiones con estos filtros.</b><span>Crea la primera orden logística de Día D.</span><button type="button" onClick={() => beginLogistics()}>Crear previsión</button></div>}</div>
      {logisticsOpen ? <div className="agenda-modal" role="dialog" aria-modal="true">
        <form className="logistics-modal" onSubmit={saveLogistics}>
          <header><div><small>ORDEN LOGÍSTICA</small><h2>{editingLogistics ? "Editar previsión" : "Nueva previsión"}</h2><p>Selecciona datos existentes del CRM, Recursos y Finanzas.</p></div><button type="button" aria-label="Cerrar" onClick={() => setLogisticsOpen(false)}>×</button></header>
          <div className="logistics-form-grid">
            <label><span>Tipo *</span><select value={logisticsForm.category} onChange={(event) => { const category = event.target.value; setLogisticsForm({ ...logisticsForm, category, checklist: [...(logisticsChecklists[category] ?? [])] }); }}>{logisticsCategories.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label><span>Estado</span><select value={logisticsForm.status} onChange={(event) => setLogisticsForm({ ...logisticsForm, status: event.target.value })}><option>PLANIFICADO</option><option>EN_PROCESO</option><option>CONCLUIDO</option></select></label>
            <label className="wide"><span>Nombre de la previsión *</span><input required value={logisticsForm.title} onChange={(event) => setLogisticsForm({ ...logisticsForm, title: event.target.value })} placeholder="Ej. Ruta Arizona → Escuela Oficial" /></label>
            <label><span>Centro de votación</span><select value={logisticsForm.center_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, center_id: event.target.value })}><option value="">Cobertura general</option>{centers.map((center) => <option key={center.id} value={center.id}>{center.name}</option>)}</select></label>
            <label><span>Comunidad / referencia</span><input value={logisticsForm.community} onChange={(event) => setLogisticsForm({ ...logisticsForm, community: event.target.value })} /></label>
            <label><span>Responsable CRM</span><select value={logisticsForm.responsible_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, responsible_id: event.target.value })}><option value="">Sin asignar</option>{contacts.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
            <label><span>Fecha y hora</span><input type="datetime-local" value={logisticsForm.scheduled_at} onChange={(event) => setLogisticsForm({ ...logisticsForm, scheduled_at: event.target.value })} /></label>
            {transportCategories.includes(logisticsForm.category) ? <>
              <label><span>Piloto CRM</span><select value={logisticsForm.driver_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, driver_id: event.target.value })}><option value="">Seleccionar…</option>{contacts.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.phone ? ` · ${person.phone}` : ""}</option>)}</select></label>
              <label><span>Vehículo de Recursos</span><select value={logisticsForm.resource_record_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, resource_record_id: event.target.value })}><option value="">Seleccionar…</option>{resources.filter((record) => /veh[ií]culo|transporte/i.test(`${record.category} ${record.title}`)).map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
              <label><span>Personas / unidades previstas</span><input type="number" min="0" value={logisticsForm.quantity} onChange={(event) => setLogisticsForm({ ...logisticsForm, quantity: event.target.value })} /></label>
              <label><span>Capacidad del vehículo</span><input type="number" min="0" value={logisticsForm.capacity} onChange={(event) => setLogisticsForm({ ...logisticsForm, capacity: event.target.value })} /></label>
              <label><span>Hora de salida</span><input type="time" value={logisticsForm.departure_at} onChange={(event) => setLogisticsForm({ ...logisticsForm, departure_at: event.target.value })} /></label>
              <label><span>Retorno previsto</span><input type="time" value={logisticsForm.return_at} onChange={(event) => setLogisticsForm({ ...logisticsForm, return_at: event.target.value })} /></label>
              <label className="wide"><span>Ruta, paradas y contingencia</span><textarea rows={3} value={logisticsForm.route_notes} onChange={(event) => setLogisticsForm({ ...logisticsForm, route_notes: event.target.value })} /></label>
            </> : null}
            {logisticsForm.category === "ALIMENTACION" ? <>
              <label><span>Proveedor (CRM)</span><select value={logisticsForm.supplier_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, supplier_id: event.target.value })}><option value="">Seleccionar…</option>{contacts.filter((person) => /proveedor/i.test(person.contact_type || "")).map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label>
              <label><span>Porciones</span><input type="number" min="0" value={logisticsForm.quantity} onChange={(event) => setLogisticsForm({ ...logisticsForm, quantity: event.target.value })} /></label>
              <label><span>Tiempos de comida</span><input value={logisticsForm.meal_times} onChange={(event) => setLogisticsForm({ ...logisticsForm, meal_times: event.target.value })} placeholder="Desayuno, almuerzo, cena" /></label>
              <label><span>Para quiénes</span><input value={logisticsForm.recipients} onChange={(event) => setLogisticsForm({ ...logisticsForm, recipients: event.target.value })} /></label>
              <label className="wide"><span>Características</span><textarea rows={2} value={logisticsForm.characteristics} onChange={(event) => setLogisticsForm({ ...logisticsForm, characteristics: event.target.value })} placeholder="Menú, restricciones alimentarias, empaque…" /></label>
              <label className="wide"><span>Método de entrega</span><textarea rows={2} value={logisticsForm.delivery_method} onChange={(event) => setLogisticsForm({ ...logisticsForm, delivery_method: event.target.value })} /></label>
            </> : null}
            {logisticsForm.category === "DATOS_MOVILES" ? <>
              <label><span>Empresa</span><select value={logisticsForm.mobile_carrier} onChange={(event) => setLogisticsForm({ ...logisticsForm, mobile_carrier: event.target.value })}><option>TIGO</option><option>CLARO</option></select></label>
              <label><span>Fiscal / número CRM</span><select value={logisticsForm.beneficiary_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, beneficiary_id: event.target.value })}><option value="">Seleccionar…</option>{fiscalContacts.filter((person) => person.phone).map((person) => <option key={person.id} value={person.id}>{person.phone} · {person.full_name}</option>)}</select></label>
              <label><span>Cantidad de recargas</span><input type="number" min="1" value={logisticsForm.quantity} onChange={(event) => setLogisticsForm({ ...logisticsForm, quantity: event.target.value })} /></label>
              <label><span>Monto por recarga (Q)</span><input type="number" min="0" step="0.01" value={logisticsForm.recharge_amount} onChange={(event) => setLogisticsForm({ ...logisticsForm, recharge_amount: event.target.value })} /></label>
              <label><span>Fecha y hora de recarga</span><input type="datetime-local" value={logisticsForm.recharge_at} onChange={(event) => setLogisticsForm({ ...logisticsForm, recharge_at: event.target.value })} /></label>
            </> : null}
            {["KIT_ELECTORAL", "EQUIPO_CENTRO"].includes(logisticsForm.category) ? <>
              <label><span>Cantidad de kits / centros</span><input type="number" min="0" value={logisticsForm.quantity} onChange={(event) => setLogisticsForm({ ...logisticsForm, quantity: event.target.value })} /></label>
              <fieldset className="wide logistics-checklist"><legend>Elementos previstos</legend>{(logisticsChecklists[logisticsForm.category] ?? []).map((item) => <label key={item}><input type="checkbox" checked={logisticsForm.checklist.includes(item)} onChange={(event) => setLogisticsForm({ ...logisticsForm, checklist: event.target.checked ? [...logisticsForm.checklist, item] : logisticsForm.checklist.filter((entry) => entry !== item) })} /><span>{item}</span></label>)}</fieldset>
            </> : null}
            {logisticsForm.category === "OTRA_PREVISION" ? <label className="wide"><span>Elementos (separados por coma)</span><textarea rows={2} value={logisticsForm.generic_elements} onChange={(event) => setLogisticsForm({ ...logisticsForm, generic_elements: event.target.value })} /></label> : null}
            <label><span>Presupuesto de Finanzas</span><select value={logisticsForm.budget_record_id} onChange={(event) => setLogisticsForm({ ...logisticsForm, budget_record_id: event.target.value })}><option value="">Sin vincular</option>{financeRecords.filter((record) => record.category === "Presupuesto" && record.status !== "ARCHIVADO").map((record) => <option key={record.id} value={record.id}>{record.title}</option>)}</select></label>
            <label><span>Costo estimado (Q)</span><input type="number" min="0" step="0.01" value={logisticsForm.estimated_cost} onChange={(event) => setLogisticsForm({ ...logisticsForm, estimated_cost: event.target.value })} /></label>
            <label className="wide"><span>Notas operativas</span><textarea rows={3} value={logisticsForm.notes} onChange={(event) => setLogisticsForm({ ...logisticsForm, notes: event.target.value })} /></label>
          </div>
          <footer><button type="button" onClick={() => setLogisticsOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar previsión"}</button></footer>
        </form>
      </div> : null}
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
