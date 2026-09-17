import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  deleteCampaignVaultFile,
  deleteCampaignRecord,
  downloadCampaignVaultFile,
  loadCampaignBundle,
  loadCampaignRecords,
  saveCampaignRecord,
  saveCampaignContact,
  uploadCampaignVaultFile,
  type CampaignActivityRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { RadarAssistant } from "./V70DirectAi0509";
import { V70PhotoEditor } from "./V70PhotoEditor";
import { announceV70CampaignUpdate, useV70CampaignBrand } from "./useV70CampaignBrand";
import { createRadarXlsx } from "../data/xlsxExport";

const planFields = [
  ["Situación del candidato", "Situación del candidato", "¿Es conocido, nuevo, oficialista u oposición? ¿Cuál es su principal ventaja y qué debe cuidar?"],
  ["Objetivo general", "Objetivo general", "¿Qué debe lograr la campaña y cómo se reconocerá un avance real?"],
  ["Meta electoral", "Meta electoral", "Votos, participación y escenario esperado"],
  ["Mensaje central", "Mensaje central y mensajes secundarios", "Primera línea: mensaje central. Debajo: mensajes secundarios, uno por línea."],
  ["Fortaleza", "Fortalezas", "Trayectoria, equipo, reconocimiento o recursos"],
  ["Debilidad", "Debilidades", "Vacíos internos que requieren atención"],
  ["Oportunidad", "Oportunidades", "Cambios o necesidades del municipio que abren espacio"],
  ["Amenaza", "Amenazas", "Factores externos que pueden afectar la ruta"],
] as const;
const municipalDiagnostic = [
  {
    title: "Agua",
    source: "PDM-OT",
    evidence: "Cobertura histórica de 17.8% en la línea base 2016.",
    prompt: "Agua segura y continuidad del servicio: precisar comunidades afectadas, causa y solución municipal posible.",
  },
  {
    title: "Residuos",
    source: "INE 2018",
    evidence: "63.3% de hogares reportó quemar basura en el Censo 2018.",
    prompt: "Recolección y manejo de residuos: verificar cambios recientes y plantear una respuesta medible por comunidad.",
  },
  {
    title: "Educación media",
    source: "PDM-OT 2015",
    evidence: "Cobertura histórica: 59.63% en básico y 34.16% en diversificado.",
    prompt: "Acceso a educación media: identificar barreras locales y acciones que sí corresponden a la municipalidad.",
  },
  {
    title: "Prevención",
    source: "Perfil municipal",
    evidence: "La lectura municipal combina seguridad ciudadana, atención a mujeres y seguridad vial.",
    prompt: "Prevención y seguridad: definir el problema comprobable, la coordinación necesaria y el resultado esperado.",
  },
] as const;
const allPlanFields = planFields;

const areaConfig = {
  "estrategia-comunicacion": {
    moduleKey: "medios",
    eyebrow: "CAMPAÑA MUNICIPAL",
    title: "Comunicación",
    description: "Piezas Oficiales",
    add: "+ Nueva carga",
    categories: ["Fotografías oficiales", "Logotipos", "Piezas de campaña", "Material para medios"],
  },
  "estrategia-finanzas": {
    moduleKey: "finanzas",
    eyebrow: "CONTROL FINANCIERO",
    title: "Control Financiero",
    description: "Ingresos, egresos, comprobantes y presupuesto",
    add: "+ Nuevo movimiento",
    categories: ["Ingreso", "Egreso", "Presupuesto", "Comprobante"],
  },
  "estrategia-legal": {
    moduleKey: "legal",
    eyebrow: "EXPEDIENTE LEGAL",
    title: "Legal",
    description: "Expedientes de candidatos y documentos del partido",
    add: "+ Agregar documento",
    categories: ["Candidato", "Partido", "Acta", "Declaración", "Otro documento"],
  },
} as const;

function useRecords(moduleKey: string) {
  const { campaign_id } = useMunicipalityContext();
  const [records, setRecords] = useState<CampaignModuleRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const load = async () => {
    if (!campaign_id) return;
    setLoading(true);
    try {
      const token = await ensureRadarAccessToken();
      setRecords((await loadCampaignRecords(campaign_id, moduleKey, token)) ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo cargar esta área.");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
  }, [campaign_id, moduleKey]);
  return { campaign_id, records, setRecords, loading, message, setMessage, load };
}

function PlanWorkspace() {
  const store = useRecords("estrategia");
  const { municipality_code } = useMunicipalityContext();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [aiField, setAiField] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [deletingVersionId, setDeletingVersionId] = useState<string | null>(null);
  const latestByCategory = useMemo(() => {
    const latest = new Map<string, CampaignModuleRecord>();
    for (const record of store.records) {
      if (record.status !== "ARCHIVADO" && !latest.has(record.category)) latest.set(record.category, record);
    }
    return latest;
  }, [store.records]);
  useEffect(() => {
    setDrafts(Object.fromEntries(allPlanFields.map(([field]) => {
      const record = latestByCategory.get(field);
      return [field, [record?.title, record?.details].filter(Boolean).join("\n")];
    })));
  }, [latestByCategory]);
  const changed = allPlanFields.filter(([field]) => {
    const record = latestByCategory.get(field);
    return (drafts[field] ?? "").trim() !== [record?.title, record?.details].filter(Boolean).join("\n").trim();
  });
  const currentRecords = allPlanFields.map(([field]) => latestByCategory.get(field)).filter((record): record is CampaignModuleRecord => Boolean(record));
  const defined = currentRecords.length;
  const hasDraft = currentRecords.some((record) => record.status !== "COMPLETADO");
  const planStatus = currentRecords.length && !hasDraft ? "PLAN VIGENTE" : "BORRADOR";
  const lastUpdated = currentRecords.map((record) => record.updated_at || record.created_at).sort().at(-1) ?? "";
  const displayDate = (value: string) => value ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "sin guardar";
  async function save() {
    if (!store.campaign_id || !changed.length) return;
    setSaving(true);
    store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      await Promise.all(changed.map(async ([category]) => {
        const current = latestByCategory.get(category);
        const text = (drafts[category] ?? "").trim();
        if (text) {
          const lines = text.split("\n");
          const title = lines.shift()?.trim() || category;
          await saveCampaignRecord(store.campaign_id!, { module_key: "estrategia", category, title, details: lines.join("\n").trim() || null, status: "EN_PROCESO", payload: {} }, token);
        }
        if (current) {
          await saveCampaignRecord(store.campaign_id!, { module_key: current.module_key, category: current.category, title: current.title, details: current.details, status: "ARCHIVADO", payload: current.payload }, token, current.id);
        }
      }));
      store.setMessage(`${changed.length} ${changed.length === 1 ? "cambio guardado" : "cambios guardados"} con tu usuario y fecha.`);
      await store.load();
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally { setSaving(false); }
  }
  function help(field: string) { setAiField((current) => current === field ? null : field); store.setMessage(""); }
  function addTalkingPoint(prompt: string) {
    setDrafts((current) => ({ ...current, "Mensaje central": [current["Mensaje central"]?.trim(), prompt].filter(Boolean).join("\n") }));
    store.setMessage("Tema agregado a mensajes. Revísalo antes de guardar.");
    document.getElementById("strategy-field-mensaje-central")?.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  function clearPlan() {
    setDrafts(Object.fromEntries(allPlanFields.map(([field]) => [field, ""])));
    store.setMessage("Los ocho campos quedaron listos para limpiarse. Presiona Guardar cambios para confirmar.");
  }
  function openHistory() {
    setHistoryOpen((current) => {
      const next = !current;
      if (next) window.requestAnimationFrame(() => document.getElementById("strategy-history")?.scrollIntoView({ behavior: "smooth", block: "start" }));
      return next;
    });
  }
  async function approvePlan() {
    if (!store.campaign_id) return;
    const pending = currentRecords.filter((record) => record.status !== "COMPLETADO");
    if (!pending.length) return;
    setApproving(true);
    store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      await Promise.all(pending.map((record) => saveCampaignRecord(store.campaign_id!, { module_key: record.module_key, category: record.category, title: record.title, details: record.details, status: "COMPLETADO", payload: record.payload }, token, record.id)));
      store.setMessage("La versión vigente del plan fue aprobada.");
      await store.load();
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo aprobar la versión."); }
    finally { setApproving(false); }
  }
  async function deleteVersion(record: CampaignModuleRecord) {
    if (!store.campaign_id || !window.confirm(`¿Borrar esta versión de “${record.category}”?`)) return;
    setDeletingVersionId(record.id);
    try {
      const token = await ensureRadarAccessToken();
      await deleteCampaignRecord(store.campaign_id, record.id, token);
      store.setMessage("Versión eliminada del historial.");
      await store.load();
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo borrar la versión."); }
    finally { setDeletingVersionId(null); }
  }
  function exportPlan() {
    window.open(`${import.meta.env.BASE_URL}reporte/estrategia?parts=summary%2Cmetrics%2Crecords`, "_blank", "noopener,noreferrer");
  }
  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>CAMPAÑA MUNICIPAL</p><h1>Plan de campaña</h1><span>Diagnóstico, objetivos y ruta electoral vigente</span></div></section>
    <section className="strategy-workspace">
      {store.message ? <div className="agenda-message strategy-message">{store.message}</div> : null}
      <div className="strategy-opening-grid"><article className="strategy-radar-reading"><h2>Lectura inicial</h2><ul><li>El padrón aumentó en <b>1,956 electores</b> frente al universo enlazado de 2023.</li><li>La cobertura electoral se organiza alrededor de <b>13 centros y 103 JRV</b>.</li><li>La campaña debe definir su posición, meta de votos y mensaje central.</li></ul><Link to={`/municipio/${municipality_code}/mapa`}>Revisar territorio en el mapa →</Link></article></div>
      <article className="strategy-issues"><header><h2>Problemas municipales</h2><Link to={`/municipio/${municipality_code}/inteligencia`}>Ver diagnóstico →</Link></header><div>{municipalDiagnostic.map((issue) => <section key={issue.title}><div><b>{issue.title}</b><small>{issue.source}</small></div><p>{issue.evidence}</p><button type="button" onClick={() => addTalkingPoint(issue.prompt)}>Agregar a mensajes</button></section>)}</div><p>Son líneas base para orientar preguntas. Deben validarse antes de convertirse en promesas o afirmaciones actuales.</p></article>
      <header className="strategy-command-bar"><div className="strategy-plan-state"><b>Plan 0509</b><span>{planStatus} · {defined}/{allPlanFields.length} campos · {displayDate(lastUpdated)}</span></div><div><button className="secondary" type="button" aria-expanded={historyOpen} onClick={openHistory}>{historyOpen ? "Cerrar historial" : `Historial (${store.records.length})`}</button><button className="secondary" type="button" disabled={defined !== allPlanFields.length} onClick={exportPlan}>Exportar plan</button><button type="button" disabled={!hasDraft || approving || changed.length > 0} onClick={() => void approvePlan()}>{approving ? "Aprobando…" : "Aprobar versión"}</button></div></header>
      <article className="strategy-direct-form"><div className="strategy-form-heading"><div><h2>Campaña electoral</h2><p>Escribe directamente. Los textos guardados quedan visibles y siempre pueden modificarse.</p></div><div className="strategy-form-actions"><button className="secondary" type="button" disabled={saving} onClick={clearPlan}>Limpiar 8 campos</button><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : `Guardar cambios${changed.length ? ` (${changed.length})` : ""}`}</button></div></div><div className="strategy-form-grid">{planFields.slice(0, 4).map(([field, label, prompt]) => <label id={`strategy-field-${field.toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-")}`} key={field}><span>{label}</span><textarea rows={field === "Mensaje central" ? 7 : 5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? `Última edición: ${displayDate(latestByCategory.get(field)?.updated_at || "")}` : "Pendiente"}</small><button type="button" onClick={() => help(field)}>Ayuda con IA</button></label>)}</div><div className="strategy-form-divider"><span>FODA</span></div><div className="strategy-form-grid foda">{planFields.slice(4).map(([field, label, prompt]) => <label key={field}><span>{label}</span><textarea rows={5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? `Última edición: ${displayDate(latestByCategory.get(field)?.updated_at || "")}` : "Pendiente"}</small><button type="button" onClick={() => help(field)}>Ayuda con IA</button></label>)}</div>{aiField ? <div className="strategy-inline-ai"><RadarAssistant compact initialPrompt={drafts[aiField]?.trim() || `Ayúdame a redactar ${aiField.toLocaleLowerCase("es")} para una campaña municipal en Puerto San José, con lenguaje verificable y sin inventar datos.`} onApply={(value) => { setDrafts((current) => ({ ...current, [aiField]: value })); setAiField(null); store.setMessage("Propuesta agregada al campo. Revísala antes de guardar."); }} /></div> : null}<footer className="strategy-form-footer"><span>Al guardar se registra tu usuario y la fecha. No se exige asignar responsable.</span><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></article>
      {historyOpen ? <article id="strategy-history" className="strategy-history"><header><div><h2>Historial de versiones</h2><p>Puedes eliminar individualmente cualquier versión guardada.</p></div></header>{store.records.length ? store.records.map((record) => <div key={record.id}><span>{record.category}</span><b>{record.title}</b><small>{record.status === "COMPLETADO" ? "Vigente" : record.status === "ARCHIVADO" ? "Archivado" : "Borrador"} · {displayDate(record.updated_at || record.created_at)}</small><button className="record-delete-action" type="button" disabled={deletingVersionId === record.id} onClick={() => void deleteVersion(record)}>{deletingVersionId === record.id ? "Eliminando…" : "Eliminar versión"}</button></div>) : <p>Todavía no hay cambios guardados.</p>}</article> : null}
    </section>
  </>;
}

function LegacyRecordsWorkspace({ config }: { config: (typeof areaConfig)[keyof typeof areaConfig] }) {
  const store = useRecords(config.moduleKey);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ category: config.categories[0] as string, title: "", details: "", status: "EN_PROCESO" });
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!store.campaign_id) return;
    setSaving(true);
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignRecord(store.campaign_id, { module_key: config.moduleKey, ...form, payload: {} }, token);
      store.setRecords((current) => [saved, ...current]);
      setForm({ category: config.categories[0], title: "", details: "", status: "EN_PROCESO" });
      setOpen(false);
      store.setMessage("Registro guardado en Campaign Vault.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo guardar el registro."); }
    finally { setSaving(false); }
  }
  async function remove(record: CampaignModuleRecord) {
    if (!store.campaign_id || !window.confirm(`¿Eliminar “${record.title}”?`)) return;
    const token = await ensureRadarAccessToken();
    await deleteCampaignRecord(store.campaign_id, record.id, token);
    store.setRecords((current) => current.filter((item) => item.id !== record.id));
  }
  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div><div className="section-banner-actions"><button onClick={() => setOpen(true)}>{config.add}</button></div></section>
    {store.message ? <p className="agenda-message">{store.message}</p> : null}
    <section className="resources-workspace"><header><div><small>CAMPAIGN VAULT · PRIVADO</small><h2>{config.title}</h2><p>{config.description}</p></div></header>{store.loading ? <div className="agenda-empty">Cargando…</div> : store.records.length ? <div className="resource-bank-grid">{store.records.map((record) => <article key={record.id}><small>{record.category}</small><h3>{record.title}</h3><p>{record.details || "Sin notas"}</p><footer><span>{record.status.replaceAll("_", " ")}</span><button className="record-delete-action" onClick={() => void remove(record)}>Eliminar</button></footer></article>)}</div> : <div className="agenda-empty"><b>Todavía no hay registros.</b><span>Usa {config.add.toLocaleLowerCase("es")} para comenzar.</span><button onClick={() => setOpen(true)}>{config.add}</button></div>}</section>
    {open ? <div className="agenda-modal" role="dialog" aria-modal="true"><form onSubmit={submit}><header><div><small>{config.eyebrow}</small><h2>{config.add.replace(/^\+\s*/, "")}</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header><div className="agenda-form-grid"><label><span>Categoría</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{config.categories.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Estado</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option>EN_PROCESO</option><option>COMPLETADO</option><option>PENDIENTE</option></select></label><label className="wide"><span>Nombre *</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label><label className="wide"><span>Detalle</span><textarea rows={5} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label></div><footer><span /><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer></form></div> : null}
  </>;
}
void LegacyRecordsWorkspace;

const candidateCategories = [
  ["Fotografía oficial", "FOTOGRAFÍA", "La misma imagen se utiliza en Inicio, CRM y Legal."],
  ["CV", "CURRÍCULUM", "Trayectoria, formación y experiencia."],
  ["Documentos personales", "DOCUMENTOS", "DPI, constancias y formularios personales."],
  ["Expediente para inscripción TSE", "INSCRIPCIÓN", "Control documental del proceso de inscripción."],
] as const;
const communicationFolders = ["Fotografías oficiales", "Logotipos", "Piezas de campaña", "Material para medios"];

function amount(record: CampaignModuleRecord) { const value = Number(record.payload?.amount ?? 0); return Number.isFinite(value) ? value : 0; }
function money(value: number) { return new Intl.NumberFormat("es-GT", { style: "currency", currency: "GTQ" }).format(value); }
function recordFilePath(record: CampaignModuleRecord) { return typeof record.payload?.file_path === "string" ? record.payload.file_path : ""; }
function legacyFileData(record: CampaignModuleRecord) { return typeof record.payload?.file_data === "string" ? record.payload.file_data : ""; }

async function saveBlob(blob: Blob, fileName: string, open = false) {
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener,noreferrer");
  else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function PrivateCampaignImage({ record }: { record: CampaignModuleRecord }) {
  const [src, setSrc] = useState(() => legacyFileData(record));
  useEffect(() => {
    const path = recordFilePath(record);
    if (!path) return;
    let alive = true;
    let objectUrl = "";
    void (async () => {
      try {
        const token = await ensureRadarAccessToken();
        objectUrl = URL.createObjectURL(await downloadCampaignVaultFile(path, token));
        if (alive) setSrc(objectUrl);
      } catch { /* El botón de descarga conserva el error visible. */ }
    })();
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [record]);
  return src ? <img src={src} alt="" /> : <i>ARCHIVO</i>;
}

function RecordsWorkspace({ config }: { config: (typeof areaConfig)[keyof typeof areaConfig] }) {
  const store = useRecords(config.moduleKey);
  const { municipality_code } = useMunicipalityContext();
  const brand = useV70CampaignBrand();
  const candidateCode = new URLSearchParams(window.location.search).get("candidate");
  const candidateMember = brand.slate.find(({ code }) => code === candidateCode);
  const candidate = candidateMember
    ? [candidateMember.code, candidateMember.fullName, candidateMember.positionLabel] as const
    : undefined;
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [folder, setFolder] = useState("Todos");
  const [folderOpen, setFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [legalFilter, setLegalFilter] = useState("TODAS");
  const [file, setFile] = useState<File | null>(null);
  const [photoEditing, setPhotoEditing] = useState(false);
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budgetDetailId, setBudgetDetailId] = useState<string | null>(null);
  const [budgetEditOpen, setBudgetEditOpen] = useState(false);
  const [budgetMovementOpen, setBudgetMovementOpen] = useState(false);
  const [budgetQuery, setBudgetQuery] = useState("");
  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [budgetForm, setBudgetForm] = useState({ scope: "Actividad", name: "", amount: "", relatedActivityId: "", affectsGeneral: true });
  const [budgetMovementForm, setBudgetMovementForm] = useState({ movement: "Egreso", concept: "", category: "Operación", amount: "", source: "", responsible: "", relatedActivityId: "" });
  const [form, setForm] = useState({ category: config.categories[0] as string, title: "", details: "", status: "COMPLETADO", amount: "", source: "", responsible: "", dueDate: "", relatedActivityId: "", fileName: "", mimeType: "" });
  const openForm = (category = config.categories[0] as string) => { setFile(null); setForm({ category, title: "", details: "", status: "COMPLETADO", amount: "", source: "", responsible: "", dueDate: "", relatedActivityId: "", fileName: "", mimeType: "" }); setOpen(true); };
  useEffect(() => {
    if (config.moduleKey !== "finanzas" || !store.campaign_id) return;
    let alive = true;
    void ensureRadarAccessToken().then((token) => loadCampaignBundle(store.campaign_id!, token)).then((bundle) => {
      if (alive) setActivities(bundle.activities);
    }).catch(() => {
      if (alive) setActivities([]);
    });
    return () => { alive = false; };
  }, [config.moduleKey, store.campaign_id]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!store.campaign_id) return; setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const storedFile = file ? await uploadCampaignVaultFile(store.campaign_id, `${config.moduleKey}-${form.category}`, file, token) : null;
      const saved = await saveCampaignRecord(store.campaign_id, { module_key: config.moduleKey, category: form.category, title: form.title.trim() || form.category.replace(/^(?:CA|EC)\d+:/, ""), details: form.details || null, status: form.status, payload: { amount: form.amount ? Number(form.amount) : null, source: form.source || null, responsible: form.responsible || null, due_date: form.dueDate || null, related_activity_id: form.relatedActivityId || null, file_name: storedFile?.file_name || null, file_path: storedFile?.path || null, file_size: storedFile?.file_size || null, mime_type: storedFile?.mime_type || null, candidate_code: candidate?.[0] || null } }, token);
      store.setRecords((current) => [saved, ...current]); setOpen(false); store.setMessage("Registro guardado en Campaign Vault.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo guardar el registro."); } finally { setSaving(false); }
  }
  async function submitBudget(event: FormEvent) {
    event.preventDefault();
    if (!store.campaign_id) return;
    setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignRecord(store.campaign_id, {
        module_key: "finanzas",
        category: "Presupuesto",
        title: budgetForm.name.trim(),
        details: budgetForm.scope,
        status: "COMPLETADO",
        payload: {
          amount: Number(budgetForm.amount),
          related_activity_id: budgetForm.scope === "Actividad" ? budgetForm.relatedActivityId || null : null,
          affects_general: budgetForm.affectsGeneral,
        },
      }, token);
      store.setRecords((current) => [saved, ...current]);
      setBudgetOpen(false);
      setBudgetForm({ scope: "Actividad", name: "", amount: "", relatedActivityId: "", affectsGeneral: true });
      store.setMessage("Presupuesto creado. Ya forma parte del control financiero.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo crear el presupuesto."); }
    finally { setSaving(false); }
  }
  async function submitBudgetEdit(event: FormEvent, record: CampaignModuleRecord) {
    event.preventDefault();
    if (!store.campaign_id) return;
    setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignRecord(store.campaign_id, {
        ...record,
        title: budgetForm.name.trim(),
        details: budgetForm.scope,
        payload: { ...record.payload, amount: Number(budgetForm.amount), related_activity_id: budgetForm.relatedActivityId || null, affects_general: budgetForm.affectsGeneral },
      }, token, record.id);
      store.setRecords((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]);
      setBudgetEditOpen(false);
      store.setMessage("Presupuesto actualizado y saldos recalculados.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo actualizar el presupuesto."); }
    finally { setSaving(false); }
  }
  async function submitBudgetMovement(event: FormEvent, budgetId: string) {
    event.preventDefault();
    if (!store.campaign_id) return;
    setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const storedFile = file ? await uploadCampaignVaultFile(store.campaign_id, "finanzas-presupuesto", file, token) : null;
      const saved = await saveCampaignRecord(store.campaign_id, {
        module_key: "finanzas", category: budgetMovementForm.movement, title: budgetMovementForm.concept.trim(), details: budgetMovementForm.category || null, status: "COMPLETADO",
        payload: { amount: Number(budgetMovementForm.amount), source: budgetMovementForm.source || null, responsible: budgetMovementForm.responsible || null, related_activity_id: budgetMovementForm.relatedActivityId || null, parent_record_id: budgetId, file_name: storedFile?.file_name || null, file_path: storedFile?.path || null, file_size: storedFile?.file_size || null, mime_type: storedFile?.mime_type || null },
      }, token);
      store.setRecords((rows) => [saved, ...rows]);
      setBudgetMovementOpen(false); setFile(null);
      setBudgetMovementForm({ movement: "Egreso", concept: "", category: "Operación", amount: "", source: "", responsible: "", relatedActivityId: "" });
      store.setMessage("Movimiento registrado; los saldos fueron actualizados.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo registrar el movimiento."); }
    finally { setSaving(false); }
  }
  async function createFolder(event: FormEvent) {
    event.preventDefault();
    if (!store.campaign_id || !folderName.trim()) return;
    setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignRecord(store.campaign_id, { module_key: "medios", category: "Carpeta", title: folderName.trim(), status: "COMPLETADO", payload: {} }, token);
      store.setRecords((current) => [saved, ...current]);
      setFolder(saved.title); setFolderName(""); setFolderOpen(false);
      store.setMessage("Carpeta creada en el banco de comunicación.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo crear la carpeta."); }
    finally { setSaving(false); }
  }
  async function removeFolder(record: CampaignModuleRecord) {
    if (!store.campaign_id) return;
    const linkedAssets = store.records.filter((item) => item.category === record.title && item.status !== "ARCHIVADO");
    if (linkedAssets.length) {
      store.setMessage(`La carpeta “${record.title}” contiene ${linkedAssets.length} archivo${linkedAssets.length === 1 ? "" : "s"}. Muévelos o bórralos antes de eliminarla.`);
      return;
    }
    if (!window.confirm(`¿Eliminar la carpeta “${record.title}”?`)) return;
    try {
      const token = await ensureRadarAccessToken();
      await deleteCampaignRecord(store.campaign_id, record.id, token);
      store.setRecords((current) => current.filter((item) => item.id !== record.id));
      if (folder === record.title) setFolder("Todos");
      store.setMessage("Carpeta eliminada.");
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : "No se pudo eliminar la carpeta.");
    }
  }
  async function chooseFile(file?: File) {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { store.setMessage("El archivo supera el límite privado de 20 MB."); return; }
    setFile(file);
    setForm((current) => ({ ...current, fileName: file.name, mimeType: file.type }));
  }
  async function remove(record: CampaignModuleRecord) {
    if (!store.campaign_id || !window.confirm(`¿Eliminar “${record.title}”?`)) return;
    try { const token = await ensureRadarAccessToken(); const path = recordFilePath(record); if (path) await deleteCampaignVaultFile(path, token); await deleteCampaignRecord(store.campaign_id, record.id, token); store.setRecords((current) => current.filter((item) => item.id !== record.id)); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo eliminar."); }
  }
  async function download(record: CampaignModuleRecord, open = false) {
    try {
      const path = recordFilePath(record);
      const legacy = legacyFileData(record);
      if (path) {
        const token = await ensureRadarAccessToken();
        await saveBlob(await downloadCampaignVaultFile(path, token), String(record.payload?.file_name || record.title), open);
      } else if (legacy) {
        const response = await fetch(legacy);
        await saveBlob(await response.blob(), String(record.payload?.file_name || record.title), open);
      }
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo abrir el archivo."); }
  }
  const hasFile = (record: CampaignModuleRecord) => Boolean(recordFilePath(record) || legacyFileData(record));
  async function saveCandidatePhoto(photo_url: string) {
    if (!store.campaign_id || !candidateMember?.contact) {
      store.setMessage("Primero agrega a este candidato en Directorio → Equipo y responsables.");
      return;
    }
    try {
      const token = await ensureRadarAccessToken();
      await saveCampaignContact(store.campaign_id, { ...candidateMember.contact, photo_url }, token, candidateMember.contact.id);
      announceV70CampaignUpdate();
      await brand.load();
      setPhotoEditing(false);
      store.setMessage("Fotografía actualizada en Inicio, Legal, CRM y Comunicación.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo actualizar la fotografía."); }
  }
  function downloadDataUrl(dataUrl: string, fileName: string) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  const modal = open ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal finance-modal" onSubmit={submit}><header><div><small>{config.moduleKey === "finanzas" ? "CONTROL FINANCIERO GENERAL" : config.moduleKey === "medios" ? "BANCO OFICIAL" : config.eyebrow}</small><h2>{config.moduleKey === "finanzas" ? "Nuevo movimiento" : config.moduleKey === "medios" ? "Nueva carga" : candidate ? `${candidate[0]} · ${form.category.replace(`${candidate[0]}:`, "")}` : config.add.replace(/^\+\s*/, "")}</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header><div>
    {config.moduleKey === "finanzas" ? <><label><span>Movimiento</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Ingreso</option><option>Egreso</option></select></label><label><span>Monto en quetzales</span><input required min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></> : config.moduleKey === "medios" ? null : candidate ? null : <label><span>Tipo *</span><select required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{config.categories.map((item) => <option key={item}>{item}</option>)}</select></label>}
    <label className="wide"><span>{config.moduleKey === "medios" ? "Nombre de la pieza" : config.moduleKey === "finanzas" ? "Concepto" : "Nombre"} *</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
    {config.moduleKey === "finanzas" ? <><label><span>Categoría / rubro</span><input value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label><label><span>Fuente</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label><label><span>Responsable</span><select value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })}><option value="">Seleccionar…</option>{brand.contacts.map((person) => <option key={person.id}>{person.full_name}</option>)}</select></label><label><span>Actividad vinculada</span><select value={form.relatedActivityId} onChange={(event) => setForm({ ...form, relatedActivityId: event.target.value })}><option value="">Sin vincular</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label></> : config.moduleKey === "medios" ? <label className="wide"><span>Carpeta</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{[...new Set([...communicationFolders, ...store.records.filter((record) => record.category === "Carpeta").map((record) => record.title)])].map((item) => <option key={item}>{item}</option>)}</select></label> : candidate ? null : <><label className="wide"><span>Requisito, responsable y evidencia</span><textarea rows={4} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label><label><span>Responsable</span><input list="legal-people" value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} placeholder="Seleccionar o escribir" /><datalist id="legal-people">{brand.contacts.map((person) => <option key={person.id} value={person.full_name} />)}</datalist></label><label><span>Fecha límite</span><input type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label><label className="wide"><span>Fuente</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Enlace, medio o documento" /></label></>}
    <label className="wide"><span>{config.moduleKey === "finanzas" ? "Factura o recibo" : config.moduleKey === "legal" && !candidate ? "Archivo o evidencia" : "Archivo"}</span><input required={config.moduleKey === "medios" || Boolean(candidate)} type="file" accept={config.moduleKey === "medios" ? "image/jpeg,image/png,image/webp,application/pdf" : "image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx"} onChange={(event) => void chooseFile(event.target.files?.[0])} /><small>{form.fileName ? `${form.fileName} listo para guardar` : config.moduleKey === "medios" ? "JPG, PNG, WebP o PDF" : "Imagen, PDF, Word o Excel · máximo 10 MB"}</small></label>
  </div><footer><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer></form></div> : null;

  if (config.moduleKey === "medios") {
    const customFolders = store.records.filter((record) => record.category === "Carpeta" && record.status !== "ARCHIVADO");
    const folderOptions = [...new Set([...communicationFolders, ...customFolders.map((record) => record.title)])];
    const assets = store.records.filter((record) => record.category !== "Carpeta" && (folder === "Todos" || record.category === folder));
    const syncedAssets = [
      ...brand.candidates.filter((person) => person.photo_url).map((person) => ({ key: `crm-${person.id}`, category: "Fotografías oficiales", title: `Fotografía oficial · ${person.full_name}`, description: `${person.candidate_position || "Candidato"} · sincronizada con su tarjeta CRM`, url: person.photo_url || "", fileName: `fotografia-${person.full_name.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-")}.jpg` })),
      ...(brand.partyLogoUrl ? [{ key: "party-logo", category: "Logotipos", title: `Logotipo oficial · ${brand.partyName || "Partido político"}`, description: "Sincronizado con la identidad definida en Inicio", url: brand.partyLogoUrl, fileName: "logotipo-partido.png" }] : []),
    ].filter((asset) => folder === "Todos" || asset.category === folder);
    return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="communication-library"><header><nav><button className={folder === "Todos" ? "active" : ""} onClick={() => setFolder("Todos")}>Todo</button>{folderOptions.map((item) => { const custom = customFolders.find((record) => record.title === item); return <span className={`communication-folder-tab ${folder === item ? "active" : ""}`} key={item}><button className={folder === item ? "active" : ""} onClick={() => setFolder(item)}>{item}</button>{custom ? <button className="communication-folder-delete" type="button" aria-label={`Eliminar carpeta ${item}`} onClick={() => void removeFolder(custom)}>×</button> : null}</span>; })}</nav><div><button className="secondary" onClick={() => setFolderOpen(true)}>+ Carpeta</button><button onClick={() => openForm(folder === "Todos" ? folderOptions[0] : folder)}>+ Nueva carga</button></div></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="communication-album">{syncedAssets.map((asset) => <article className="communication-asset communication-synced" key={asset.key}><a className="communication-preview" href={asset.url} target="_blank" rel="noreferrer"><div><img src={asset.url} alt={asset.title} /></div><span><b>{asset.title}</b><small>{asset.category}</small><em>{asset.description}</em></span></a><div className="communication-asset-actions"><button type="button" onClick={() => downloadDataUrl(asset.url, asset.fileName)}>Descargar</button><span className="communication-sync-label">VINCULADO AUTOMÁTICAMENTE</span></div></article>)}{assets.map((record) => <article className="communication-asset" key={record.id}><button type="button" className="communication-preview" onClick={() => void download(record, true)}><div>{String(record.payload?.mime_type || "").startsWith("image/") && hasFile(record) ? <PrivateCampaignImage record={record} /> : <i>ARCHIVO</i>}</div><span><b>{record.title}</b><small>{record.category}</small></span></button><div className="communication-asset-actions">{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Descargar</button> : null}<button type="button" onClick={() => void remove(record)}>Borrar</button></div></article>)}{!syncedAssets.length && !assets.length ? <div className="communication-empty"><b>Banco oficial listo para recibir piezas.</b><span>Carga fotografías, logotipos y materiales aprobados de campaña.</span><button onClick={() => openForm(folderOptions[0])}>Nueva carga</button></div> : null}</div></section>{modal}{folderOpen ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal" onSubmit={createFolder}><header><div><small>COMUNICACIÓN</small><h2>Nueva carpeta</h2></div><button type="button" onClick={() => setFolderOpen(false)}>×</button></header><div><label className="wide"><span>Nombre de la carpeta *</span><input autoFocus required value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label></div><footer><button type="button" onClick={() => setFolderOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Creando…" : "Crear carpeta"}</button></footer></form></div> : null}</>;
  }
  if (config.moduleKey === "finanzas") {
    const budgets = store.records.filter((item) => item.category === "Presupuesto" && item.status !== "ARCHIVADO");
    const movements = store.records.filter((item) => (item.category === "Ingreso" || item.category === "Egreso") && item.status !== "ARCHIVADO");
    const income = movements.filter((item) => item.category === "Ingreso").reduce((sum, item) => sum + amount(item), 0);
    const expense = movements.filter((item) => item.category === "Egreso").reduce((sum, item) => sum + amount(item), 0);
    const budget = budgets.filter((item) => item.payload?.affects_general !== false).reduce((sum, item) => sum + amount(item), 0);
    const activityName = (id: unknown) => activities.find((activity) => activity.id === String(id || ""))?.title || "—";
    const visibleBudgets = budgets.filter((record) => {
      const term = budgetQuery.trim().toLocaleLowerCase("es");
      return !term || [record.title, record.details, activityName(record.payload?.related_activity_id)].join(" ").toLocaleLowerCase("es").includes(term);
    });
    const selectedBudget = budgets.find((record) => record.id === budgetDetailId);
    const selectedBudgetMovements = selectedBudget ? movements.filter((record) => String(record.payload?.parent_record_id || "") === selectedBudget.id) : [];
    const selectedIncome = selectedBudgetMovements.filter((record) => record.category === "Ingreso").reduce((sum, record) => sum + amount(record), 0);
    const selectedExpense = selectedBudgetMovements.filter((record) => record.category === "Egreso").reduce((sum, record) => sum + amount(record), 0);
    const exportExcel = () => {
      const campaign = `${brand.candidateName} · ${brand.partyName || "Campaña municipal"}`;
      const generated = new Intl.DateTimeFormat("es-GT", { dateStyle: "long" }).format(new Date());
      const workbook = createRadarXlsx([
        { name: "Resumen general", title: "RADAR · Control financiero", subtitle: `${campaign} · Generado el ${generated}`, headers: ["Indicador", "Monto", "Cómo se calcula"], rows: [["Presupuesto general", budget, "Presupuestos específicos vinculados"], ["Ingresos", income, "Ingresos registrados"], ["Egresos", expense, "Egresos registrados"], ["Disponible", income - expense, "Ingresos menos egresos"]], widths: [28, 18, 56] },
        { name: "Movimientos", title: "Movimientos generales", subtitle: campaign, headers: ["Tipo", "Concepto", "Categoría", "Fuente", "Responsable", "Actividad", "Monto", "Estado", "Fecha"], rows: movements.map((record) => [record.category, record.title, record.details || "—", String(record.payload?.source || "—"), String(record.payload?.responsible || "—"), activityName(record.payload?.related_activity_id), amount(record), record.status, new Date(record.created_at).toLocaleDateString("es-GT")]), widths: [13, 34, 22, 20, 26, 32, 16, 16, 14] },
        { name: "Presupuestos", title: "Presupuestos específicos", subtitle: campaign, headers: ["Tipo", "Presupuesto", "Actividad o rubro", "Monto inicial", "Afecta general"], rows: budgets.map((record) => [record.details || "Presupuesto", record.title, record.payload?.related_activity_id ? activityName(record.payload.related_activity_id) : "Rubro independiente", amount(record), record.payload?.affects_general !== false ? "Sí" : "No"]), widths: [16, 34, 34, 18, 18] },
      ]);
      void saveBlob(workbook, `RADAR_Control_Financiero_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
    const exportBudgetExcel = (record: CampaignModuleRecord) => {
      const workbook = createRadarXlsx([
        { name: "Resumen", title: record.title, subtitle: `${record.details || "Presupuesto específico"} · ${brand.candidateName}`, headers: ["Indicador", "Monto o estado", "Detalle"], rows: [["Presupuesto inicial", amount(record), "Monto aprobado para este control"], ["Ingresos", selectedIncome, "Ingresos registrados"], ["Egresos", selectedExpense, "Egresos registrados"], ["Disponible", amount(record) + selectedIncome - selectedExpense, "Presupuesto inicial + ingresos − egresos"], ["Afecta presupuesto general", record.payload?.affects_general !== false ? "Sí" : "No", record.payload?.affects_general !== false ? "Se consolida automáticamente" : "Se mantiene independiente"]], widths: [30, 22, 58] },
        { name: "Movimientos", title: `Movimientos · ${record.title}`, headers: ["Tipo", "Concepto", "Categoría", "Fuente", "Responsable", "Actividad", "Monto", "Fecha"], rows: selectedBudgetMovements.map((movement) => [movement.category, movement.title, movement.details || "—", String(movement.payload?.source || "—"), String(movement.payload?.responsible || "—"), activityName(movement.payload?.related_activity_id), amount(movement), new Date(movement.created_at).toLocaleDateString("es-GT")]), widths: [12, 34, 22, 20, 26, 30, 18, 14] },
      ]);
      void saveBlob(workbook, `RADAR_${record.title.replace(/[^a-z0-9]+/gi, "_")}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };
    if (selectedBudget) {
      const available = amount(selectedBudget) + selectedIncome - selectedExpense;
      return <><section className="section-banner"><div className="section-banner-copy"><p>PRESUPUESTO ESPECÍFICO</p><h1>{selectedBudget.title}</h1><span>{selectedBudget.details || "Control financiero"}</span></div></section><section className="finance-control finance-budget-detail"><header className="finance-budget-toolbar"><div><span><small>PRESUPUESTO INICIAL</small><b>{money(amount(selectedBudget))}</b></span><span><small>INGRESOS</small><b>{money(selectedIncome)}</b></span><span><small>EGRESOS</small><b>{money(selectedExpense)}</b></span><span><small>DISPONIBLE</small><b>{money(available)}</b></span></div><nav><button className="finance-back" type="button" onClick={() => setBudgetDetailId(null)}>← Regresar al general</button><button className="secondary" type="button" onClick={() => exportBudgetExcel(selectedBudget)}>↓ Descargar Excel</button><button className="secondary" type="button" onClick={() => { setBudgetForm({ scope: selectedBudget.details || "Rubro", name: selectedBudget.title, amount: String(amount(selectedBudget)), relatedActivityId: String(selectedBudget.payload?.related_activity_id || ""), affectsGeneral: selectedBudget.payload?.affects_general !== false }); setBudgetEditOpen(true); }}>Editar presupuesto</button><button type="button" onClick={() => { setFile(null); setBudgetMovementOpen(true); }}>+ Registrar movimiento</button></nav></header><section className="finance-budget-heading"><div><small>{selectedBudget.details || "PRESUPUESTO ESPECÍFICO"}</small><h2>{selectedBudget.title}</h2><p>{selectedBudget.payload?.related_activity_id ? activityName(selectedBudget.payload.related_activity_id) : "Rubro independiente"}</p></div><span className={selectedBudget.payload?.affects_general !== false ? "linked" : "independent"}>{selectedBudget.payload?.affects_general !== false ? "Sincronizado con el presupuesto general" : "No afecta el presupuesto general"}</span></section>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="finance-sheet"><div className="finance-row head"><span>Tipo</span><span>Concepto</span><span>Categoría</span><span>Fuente</span><span>Responsable</span><span>Actividad</span><span>Monto</span><span>Acciones</span></div>{selectedBudgetMovements.length ? selectedBudgetMovements.map((record) => <article className="finance-row" key={record.id}><span><em className={record.category === "Ingreso" ? "income" : "expense"}>{record.category}</em></span><span><b>{record.title}</b></span><span>{record.details || "—"}</span><span>{String(record.payload?.source || "—")}</span><span>{String(record.payload?.responsible || "—")}</span><span>{activityName(record.payload?.related_activity_id)}</span><span><b>{money(amount(record))}</b></span><span className="finance-actions">{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Archivo</button> : null}<button className="record-delete-action" type="button" onClick={() => void remove(record)}>Eliminar</button></span></article>) : <p className="finance-empty-row">Este presupuesto todavía no tiene movimientos.</p>}</div></section>{budgetEditOpen ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal finance-modal" onSubmit={(event) => void submitBudgetEdit(event, selectedBudget)}><header><div><small>PRESUPUESTO ESPECÍFICO</small><h2>Editar presupuesto</h2></div><button type="button" onClick={() => setBudgetEditOpen(false)}>×</button></header><div><label className="wide"><span>Nombre</span><input required value={budgetForm.name} onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })} /></label><label><span>Monto inicial</span><input required min="0" step="0.01" type="number" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} /></label><label><span>Actividad vinculada</span><select value={budgetForm.relatedActivityId} onChange={(event) => setBudgetForm({ ...budgetForm, relatedActivityId: event.target.value })}><option value="">Sin vincular</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label><label className="wide finance-switch"><input type="checkbox" checked={budgetForm.affectsGeneral} onChange={(event) => setBudgetForm({ ...budgetForm, affectsGeneral: event.target.checked })} /><span><b>Afectar el presupuesto general</b><small>Al activarlo, el monto y sus movimientos se consolidan automáticamente.</small></span></label></div><footer><button type="button" onClick={() => setBudgetEditOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></form></div> : null}{budgetMovementOpen ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal finance-modal" onSubmit={(event) => void submitBudgetMovement(event, selectedBudget.id)}><header><div><small>{selectedBudget.title}</small><h2>Nuevo movimiento</h2></div><button type="button" onClick={() => setBudgetMovementOpen(false)}>×</button></header><div><label><span>Movimiento</span><select value={budgetMovementForm.movement} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, movement: event.target.value })}><option>Ingreso</option><option>Egreso</option></select></label><label><span>Monto en quetzales</span><input required min="0" step="0.01" type="number" value={budgetMovementForm.amount} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, amount: event.target.value })} /></label><label className="wide"><span>Concepto</span><input required value={budgetMovementForm.concept} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, concept: event.target.value })} /></label><label><span>Categoría</span><input value={budgetMovementForm.category} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, category: event.target.value })} /></label><label><span>Fuente</span><input value={budgetMovementForm.source} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, source: event.target.value })} /></label><label><span>Responsable</span><select value={budgetMovementForm.responsible} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, responsible: event.target.value })}><option value="">Seleccionar…</option>{brand.contacts.map((person) => <option key={person.id}>{person.full_name}</option>)}</select></label><label><span>Actividad vinculada</span><select value={budgetMovementForm.relatedActivityId} onChange={(event) => setBudgetMovementForm({ ...budgetMovementForm, relatedActivityId: event.target.value })}><option value="">Sin vincular</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label><label className="wide"><span>Factura o recibo</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void chooseFile(event.target.files?.[0])} /></label></div><footer><button type="button" onClick={() => setBudgetMovementOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar movimiento"}</button></footer></form></div> : null}</>;
    }
    return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="finance-control"><header><div><span><small>PRESUPUESTO GENERAL</small><b>{money(budget)}</b></span><span><small>INGRESOS</small><b>{money(income)}</b></span><span><small>EGRESOS</small><b>{money(expense)}</b></span><span><small>DISPONIBLE</small><b>{money(income - expense)}</b></span></div><aside className="finance-general-explainer"><b>¿Qué significa Presupuesto general?</b><p>Es el total planificado: suma únicamente los presupuestos específicos que marcaste como “Afectar el presupuesto general”. No representa dinero gastado. El disponible se calcula por separado como ingresos menos egresos.</p></aside><nav><button className="secondary" onClick={exportExcel}>↓ Descargar Excel</button><button className="secondary" onClick={() => setBudgetOpen(true)}>+ Nuevo presupuesto</button><button onClick={() => openForm("Egreso")}>+ Registrar movimiento</button></nav></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<section className="finance-budgets"><header><div><small>PRESUPUESTOS POR ACTIVIDAD O RUBRO</small><h2>Presupuestos creados</h2></div><label><span>⌕</span><input value={budgetQuery} onChange={(event) => setBudgetQuery(event.target.value)} placeholder="Buscar presupuesto" /></label></header><div>{visibleBudgets.length ? visibleBudgets.map((record) => <article key={record.id}><button type="button" className="finance-budget-link" onClick={() => setBudgetDetailId(record.id)}><small>{record.details || "Presupuesto"}</small><b>{record.title}</b><em><span>{record.payload?.related_activity_id ? activityName(record.payload.related_activity_id) : "Rubro independiente"}</span><span className={record.payload?.affects_general !== false ? "included" : "independent"}>{record.payload?.affects_general !== false ? "Incluido en el general" : "Independiente"}</span></em></button><strong>{money(amount(record))}</strong><button type="button" onClick={() => void remove(record)}>Eliminar</button></article>) : <p>No hay presupuestos con esta búsqueda.</p>}</div></section><div className="finance-sheet"><div className="finance-row head"><span>Tipo</span><span>Concepto</span><span>Categoría</span><span>Fuente</span><span>Responsable</span><span>Actividad</span><span>Monto</span><span>Acciones</span></div>{movements.filter((record) => !record.payload?.parent_record_id).map((record) => <article className="finance-row" key={record.id}><span><em className={record.category === "Ingreso" ? "income" : "expense"}>{record.category}</em></span><span><b>{record.title}</b></span><span>{record.details || "—"}</span><span>{String(record.payload?.source || "—")}</span><span>{String(record.payload?.responsible || "—")}</span><span>{activityName(record.payload?.related_activity_id)}</span><span><b>{money(amount(record))}</b></span><span className="finance-actions">{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Archivo</button> : null}<button className="record-delete-action" onClick={() => void remove(record)}>Eliminar</button></span></article>)}</div></section>{budgetOpen ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal finance-modal" onSubmit={submitBudget}><header><div><small>CONTROL FINANCIERO</small><h2>Nuevo presupuesto</h2></div><button type="button" onClick={() => setBudgetOpen(false)}>×</button></header><div><label><span>Tipo</span><select value={budgetForm.scope} onChange={(event) => setBudgetForm({ ...budgetForm, scope: event.target.value, relatedActivityId: "" })}><option>Actividad</option><option>Rubro</option></select></label><label><span>Monto inicial en quetzales</span><input required min="0" step="0.01" type="number" value={budgetForm.amount} onChange={(event) => setBudgetForm({ ...budgetForm, amount: event.target.value })} /></label><label className="wide"><span>Nombre del presupuesto</span><input required value={budgetForm.name} onChange={(event) => setBudgetForm({ ...budgetForm, name: event.target.value })} placeholder="Ej. Mitin de apertura o comunicación" /></label>{budgetForm.scope === "Actividad" ? <label className="wide"><span>Actividad vinculada</span><select value={budgetForm.relatedActivityId} onChange={(event) => setBudgetForm({ ...budgetForm, relatedActivityId: event.target.value })}><option value="">Seleccionar actividad…</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label> : null}<label className="wide finance-switch"><input type="checkbox" checked={budgetForm.affectsGeneral} onChange={(event) => setBudgetForm({ ...budgetForm, affectsGeneral: event.target.checked })} /><span><b>Afectar el presupuesto general</b><small>Su monto y movimientos se consolidarán automáticamente en el balance general.</small></span></label></div><footer><button type="button" onClick={() => setBudgetOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Crear presupuesto"}</button></footer></form></div> : null}{modal}</>;
  }
  if (candidate) {
    const legacyCandidateCode = candidate[0].replace(/^CA/, "EC");
    const records = store.records.filter((record) => record.category.startsWith(`${candidate[0]}:`) || record.category.startsWith(`${legacyCandidateCode}:`));
    return <><section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE INDIVIDUAL</p><h1>{candidate[1]}</h1><span>{candidate[0]} · {candidate[2]}</span></div></section><section className="candidate-dossier"><header>{candidateMember?.photoUrl ? <img src={candidateMember.photoUrl} alt={`Fotografía de ${candidate[1]}`} /> : <i>{candidate[0].slice(-2)}</i>}<div><small>EXPEDIENTE PRIVADO · DATOS DEL CRM</small><h2>{candidate[1]}</h2><p>{candidate[2]}</p></div><Link to={`/municipio/${municipality_code}/estrategia-legal`}>← Volver a Legal</Link></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<section className="candidate-files candidate-file-categories"><div className="candidate-upload-grid">{candidateCategories.map(([key, eyebrow, detail]) => { const category = `${candidate[0]}:${key}`; const files = records.filter((record) => record.category === category); const isPhoto = key === "Fotografía oficial"; return <article className="candidate-upload-card" key={key}>{isPhoto && candidateMember?.photoUrl ? <img src={candidateMember.photoUrl} alt={`Fotografía de ${candidate[1]}`} /> : null}<small>{eyebrow}</small><b>{key}</b><span>{detail}</span><mark className="candidate-record-owner">Vinculado a {candidate[1]}</mark><em>{isPhoto && candidateMember?.photoUrl ? "Fotografía activa" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}</em>{isPhoto ? <button type="button" onClick={() => setPhotoEditing((value) => !value)}>{candidateMember?.photoUrl ? "Cambiar fotografía" : "Agregar fotografía"}</button> : <button type="button" onClick={() => openForm(category)}>+ Cargar archivo</button>}{isPhoto && photoEditing ? <div className="candidate-photo-editor"><V70PhotoEditor currentSrc={candidateMember?.photoUrl || ""} onChange={(photo_url) => void saveCandidatePhoto(photo_url)} onError={store.setMessage} /><button type="button" onClick={() => setPhotoEditing(false)}>Cancelar</button></div> : null}{files.map((record) => <p key={record.id}>{hasFile(record) ? <button type="button" onClick={() => void download(record, true)}>{record.title}</button> : record.title}<button type="button" onClick={() => void remove(record)}>Borrar</button></p>)}</article>; })}</div></section></section>{modal}</>;
  }
  const partyDocuments = store.records.filter((record) => !record.category.match(/^(?:CA|EC)\d+:/));
  const visiblePartyDocuments = partyDocuments.filter((record) => legalFilter === "TODAS" || record.category === legalFilter);
  return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="legal-hub"><article className="legal-candidates"><header><small>PLANILLA MUNICIPAL</small><h2>Candidatos</h2></header><div>{brand.slate.map((member) => <Link id={`candidate-${member.code}`} to={`/municipio/${municipality_code}/estrategia-legal?candidate=${member.code}`} key={member.code}><span className="legal-avatar">{member.photoUrl ? <img src={member.photoUrl} alt={`Fotografía de ${member.fullName}`} /> : <i>{member.code.slice(-2)}</i>}</span><span><small>{member.code}</small><b>{member.fullName}</b><em>{member.positionLabel}</em></span><strong>Expediente →</strong></Link>)}</div></article><article className="legal-party"><header><small>ORGANIZACIÓN POLÍTICA</small><h2>Documentos del partido</h2><p>Requisitos, actas, documentos y plantillas.</p></header><section className="campaign-workspace"><header className="campaign-workspace-bar"><div className="control-kpis"><span><b>{partyDocuments.length}</b> registros</span></div><button onClick={() => openForm("Requisitos")}>+ Agregar documento</button></header><div className="campaign-workspace-filters"><label>Tipo<select value={legalFilter} onChange={(event) => setLegalFilter(event.target.value)}><option value="TODAS">Todos</option>{["Requisitos", "Actas", "Documentos", "Plantillas"].map((category) => <option key={category}>{category}</option>)}</select></label></div>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="campaign-record-list">{visiblePartyDocuments.length ? visiblePartyDocuments.map((record) => <article key={record.id}><div className="record-main"><small>{record.category}</small><b>{record.title}</b>{record.details ? <p>{record.details}</p> : null}<div><span>{String(record.payload?.responsible || "Sin responsable")}</span><span>{record.payload?.due_date ? new Date(`${String(record.payload.due_date)}T00:00:00`).toLocaleDateString("es-GT") : "Sin fecha"}</span>{record.payload?.source ? <span>Fuente: {String(record.payload.source)}</span> : null}</div></div><div className="record-actions">{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Ver {String(record.payload?.file_name || "archivo")}</button> : null}<button onClick={() => void remove(record)}>Eliminar</button></div></article>) : <div className="campaign-empty"><b>No hay registros con estos filtros.</b><button onClick={() => openForm("Requisitos")}>Crear el primero</button></div>}</div></section></article></section>{modal}</>;
}

function StrategyAreaContent({ section }: { section: string }) {
  if (section === "estrategia-plan") return <PlanWorkspace />;
  const config = areaConfig[section as keyof typeof areaConfig];
  return config ? <RecordsWorkspace config={config} /> : null;
}

export function V70DirectStrategyArea0509() {
  const { municipalityCode, section = "" } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509") return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="estrategia" eyebrow="ESTRATEGIA" topbarTitle="San José / Puerto San José · Escuintla"><StrategyAreaContent section={section} /></V70DirectShell0509></MunicipalityProvider>;
}
