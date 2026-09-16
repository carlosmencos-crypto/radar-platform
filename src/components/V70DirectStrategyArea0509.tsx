import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  deleteCampaignVaultFile,
  deleteCampaignRecord,
  downloadCampaignVaultFile,
  loadCampaignRecords,
  saveCampaignRecord,
  uploadCampaignVaultFile,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { RadarAssistant } from "./V70DirectAi0509";
import { useV70CampaignBrand } from "./useV70CampaignBrand";

const planFields = [
  ["Situación del candidato", "¿Es conocido, nuevo, oficialista u oposición? ¿Cuál es su principal ventaja y qué debe cuidar?"],
  ["Objetivo general", "¿Qué debe lograr la campaña y cómo se reconocerá un avance real?"],
  ["Meta electoral", "Votos, participación y escenario esperado"],
  ["Mensaje central", "Primera línea: mensaje central. Debajo: mensajes secundarios, uno por línea."],
  ["Fortaleza", "Trayectoria, equipo, reconocimiento o recursos"],
  ["Debilidad", "Vacíos internos que requieren atención"],
  ["Oportunidad", "Cambios o necesidades del municipio que abren espacio"],
  ["Amenaza", "Factores externos que pueden afectar la ruta"],
] as const;
const municipalIssues = [
  ["Problema municipal · Agua", "Continuidad, calidad, cobertura y comunidades afectadas."],
  ["Problema municipal · Residuos", "Recolección, disposición final, quema y puntos críticos."],
  ["Problema municipal · Educación media", "Acceso a básico y diversificado, distancia y deserción."],
  ["Problema municipal · Prevención", "Inundaciones, drenajes, seguridad y rutas vulnerables."],
] as const;
const allPlanFields = [...planFields.slice(0, 4), ...municipalIssues, ...planFields.slice(4)] as const;

const areaConfig = {
  "estrategia-comunicacion": {
    moduleKey: "medios",
    eyebrow: "COMUNICACIÓN",
    title: "Comunicación",
    description: "Banco oficial de fotografías, logos y piezas de campaña",
    add: "+ Agregar pieza",
    categories: ["Fotografía", "Logotipo", "Pieza gráfica", "Guion", "Comunicado"],
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
  useEffect(() => {
    const latest = new Map<string, CampaignModuleRecord>();
    store.records.forEach((record) => { if (!latest.has(record.category)) latest.set(record.category, record); });
    setDrafts(Object.fromEntries(allPlanFields.map(([field]) => {
      const record = latest.get(field);
      return [field, [record?.title, record?.details].filter(Boolean).join("\n")];
    })));
  }, [store.records]);
  const latestByCategory = useMemo(() => new Map(store.records.map((record) => [record.category, record])), [store.records]);
  const changed = allPlanFields.filter(([field]) => {
    const record = latestByCategory.get(field);
    return (drafts[field] ?? "").trim() !== [record?.title, record?.details].filter(Boolean).join("\n").trim();
  });
  async function save() {
    if (!store.campaign_id || !changed.length) return;
    setSaving(true);
    store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      await Promise.all(changed.map(async ([category]) => {
        const lines = (drafts[category] ?? "").trim().split("\n");
        const title = lines.shift()?.trim() || category;
        return saveCampaignRecord(store.campaign_id!, { module_key: "estrategia", category, title, details: lines.join("\n").trim() || null, status: "EN_PROCESO", payload: {} }, token, latestByCategory.get(category)?.id ?? null);
      }));
      store.setMessage(`${changed.length} ${changed.length === 1 ? "cambio guardado" : "cambios guardados"} con tu usuario y fecha.`);
      await store.load();
    } catch (error) {
      store.setMessage(error instanceof Error ? error.message : "No se pudieron guardar los cambios.");
    } finally { setSaving(false); }
  }
  function help(field: string) { setAiField((current) => current === field ? null : field); store.setMessage(""); }
  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>PLAN DE CAMPAÑA</p><h1>Estrategia electoral</h1><span>Diagnóstico, objetivos y decisiones vigentes</span></div></section>
    <section className="strategy-workspace">
      {store.message ? <div className="agenda-message strategy-message">{store.message}</div> : null}
      <div className="strategy-opening-grid"><article className="strategy-radar-reading"><h2>Lectura inicial</h2><ul><li>El padrón aumentó en <b>1,956 electores</b> frente al universo enlazado de 2023.</li><li>La cobertura electoral se organiza alrededor de <b>13 centros y 103 JRV</b>.</li><li>La campaña debe definir su posición, meta de votos y mensaje central.</li></ul><Link to={`/municipio/${municipality_code}/mapa`}>Revisar territorio en el mapa →</Link></article></div>
      <header className="strategy-command-bar"><div className="strategy-plan-state"><b>Plan 0509</b><span>BORRADOR · {store.records.length}/{allPlanFields.length} campos</span></div><div><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : `Guardar cambios${changed.length ? ` (${changed.length})` : ""}`}</button></div></header>
      <article className="strategy-direct-form"><div className="strategy-form-heading"><div><h2>Campaña electoral</h2><p>Escribe directamente o usa IA RADAR para preparar un borrador editable.</p></div></div><div className="strategy-form-grid">{planFields.slice(0, 4).map(([field, prompt]) => <label key={field}><span>{field}<button type="button" className="strategy-ai-help" onClick={() => help(field)}>Ayuda con IA</button></span><textarea rows={field === "Mensaje central" ? 7 : 5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? "Guardado en Campaign Vault" : "Pendiente"}</small></label>)}</div><div className="strategy-form-divider"><span>PROBLEMAS MUNICIPALES</span></div><div className="strategy-form-grid municipal-issues">{municipalIssues.map(([field, prompt]) => <label key={field}><span>{field.replace("Problema municipal · ", "")}<button type="button" className="strategy-ai-help" onClick={() => help(field)}>Ayuda con IA</button></span><textarea rows={5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? "Guardado en Campaign Vault" : "Pendiente"}</small></label>)}</div><div className="strategy-form-divider"><span>FODA</span></div><div className="strategy-form-grid foda">{planFields.slice(4).map(([field, prompt]) => <label key={field}><span>{field === "Fortaleza" ? "Fortalezas" : field === "Debilidad" ? "Debilidades" : field === "Oportunidad" ? "Oportunidades" : "Amenazas"}<button type="button" className="strategy-ai-help" onClick={() => help(field)}>Ayuda con IA</button></span><textarea rows={5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? "Guardado en Campaign Vault" : "Pendiente"}</small></label>)}</div>{aiField ? <div className="strategy-inline-ai"><RadarAssistant compact initialPrompt={drafts[aiField]?.trim() || `Ayúdame a redactar ${aiField.toLocaleLowerCase("es")} para una campaña municipal en Puerto San José, con lenguaje verificable y sin inventar datos.`} onApply={(value) => { setDrafts((current) => ({ ...current, [aiField]: value })); setAiField(null); store.setMessage("Propuesta agregada al campo. Revísala antes de guardar."); }} /></div> : null}<footer className="strategy-form-footer"><span>Al guardar se registra tu usuario y la fecha.</span><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></article>
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
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({ category: config.categories[0] as string, title: "", details: "", status: "COMPLETADO", amount: "", source: "", responsible: "", fileName: "", mimeType: "" });
  const openForm = (category = config.categories[0] as string) => { setFile(null); setForm({ category, title: "", details: "", status: "COMPLETADO", amount: "", source: "", responsible: "", fileName: "", mimeType: "" }); setOpen(true); };
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!store.campaign_id) return; setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const storedFile = file ? await uploadCampaignVaultFile(store.campaign_id, `${config.moduleKey}-${form.category}`, file, token) : null;
      const saved = await saveCampaignRecord(store.campaign_id, { module_key: config.moduleKey, category: form.category, title: form.title.trim() || form.category.replace(/^EC\d+:/, ""), details: form.details || null, status: form.status, payload: { amount: form.amount ? Number(form.amount) : null, source: form.source || null, responsible: form.responsible || null, file_name: storedFile?.file_name || null, file_path: storedFile?.path || null, file_size: storedFile?.file_size || null, mime_type: storedFile?.mime_type || null, candidate_code: candidate?.[0] || null } }, token);
      store.setRecords((current) => [saved, ...current]); setOpen(false); store.setMessage("Registro guardado en Campaign Vault.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo guardar el registro."); } finally { setSaving(false); }
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
  function downloadDataUrl(dataUrl: string, fileName: string) {
    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  const modal = open ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal finance-modal" onSubmit={submit}><header><div><small>{config.eyebrow}</small><h2>{config.moduleKey === "finanzas" ? "Nuevo movimiento" : candidate ? `${candidate[0]} · ${form.category.replace(`${candidate[0]}:`, "")}` : config.add.replace(/^\+\s*/, "")}</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header><div>
    {config.moduleKey === "finanzas" ? <><label><span>Movimiento</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}><option>Ingreso</option><option>Egreso</option><option>Presupuesto</option></select></label><label><span>Monto en quetzales</span><input required min="0" step="0.01" type="number" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} /></label></> : candidate ? null : <label><span>Categoría</span><select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>{config.categories.map((item) => <option key={item}>{item}</option>)}</select></label>}
    <label className="wide"><span>Nombre *</span><input autoFocus required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
    {config.moduleKey === "finanzas" ? <><label><span>Categoría / rubro</span><input value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label><label><span>Fuente</span><input value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} /></label><label><span>Responsable</span><input value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} /></label></> : <label className="wide"><span>Detalle</span><textarea rows={4} value={form.details} onChange={(event) => setForm({ ...form, details: event.target.value })} /></label>}
    <label className="wide"><span>{config.moduleKey === "finanzas" ? "Factura o recibo" : "Archivo"}</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx" onChange={(event) => void chooseFile(event.target.files?.[0])} /><small>{form.fileName ? `${form.fileName} listo para guardar` : "PDF, imagen u Office"}</small></label>
  </div><footer><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></footer></form></div> : null;

  if (config.moduleKey === "medios") {
    const assets = store.records.filter((record) => record.category !== "Carpeta" && (folder === "Todos" || record.category === folder));
    const syncedAssets = [
      ...brand.candidates.filter((person) => person.photo_url).map((person) => ({ key: `crm-${person.id}`, category: "Fotografías oficiales", title: `Fotografía oficial · ${person.full_name}`, description: `${person.candidate_position || "Candidato"} · sincronizada con su tarjeta CRM`, url: person.photo_url || "", fileName: `fotografia-${person.full_name.toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, "-")}.jpg` })),
      ...(brand.partyLogoUrl ? [{ key: "party-logo", category: "Logotipos", title: `Logotipo oficial · ${brand.partyName || "Partido político"}`, description: "Sincronizado con la identidad definida en Inicio", url: brand.partyLogoUrl, fileName: "logotipo-partido.png" }] : []),
    ].filter((asset) => folder === "Todos" || asset.category === folder);
    return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="communication-library"><header><nav><button className={folder === "Todos" ? "active" : ""} onClick={() => setFolder("Todos")}>Todo</button>{communicationFolders.map((item) => <button className={folder === item ? "active" : ""} key={item} onClick={() => setFolder(item)}>{item}</button>)}</nav><div><button onClick={() => openForm(folder === "Todos" ? communicationFolders[0] : folder)}>+ Nueva carga</button></div></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="communication-album">{syncedAssets.map((asset) => <article className="communication-asset communication-synced" key={asset.key}><a className="communication-preview" href={asset.url} target="_blank" rel="noreferrer"><div><img src={asset.url} alt={asset.title} /></div><span><b>{asset.title}</b><small>{asset.category}</small><em>{asset.description}</em></span></a><div className="communication-asset-actions"><button type="button" onClick={() => downloadDataUrl(asset.url, asset.fileName)}>Descargar</button><span className="communication-sync-label">VINCULADO AUTOMÁTICAMENTE</span></div></article>)}{assets.map((record) => <article className="communication-asset" key={record.id}><button type="button" className="communication-preview" onClick={() => void download(record, true)}><div>{String(record.payload?.mime_type || "").startsWith("image/") && hasFile(record) ? <PrivateCampaignImage record={record} /> : <i>ARCHIVO</i>}</div><span><b>{record.title}</b><small>{record.category}</small><em>{record.details}</em></span></button><div className="communication-asset-actions">{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Descargar</button> : null}<button type="button" onClick={() => void remove(record)}>Borrar</button></div></article>)}{!syncedAssets.length && !assets.length ? <div className="communication-empty"><b>Banco oficial listo para recibir piezas.</b><span>Carga fotografías, logotipos y materiales aprobados de campaña.</span><button onClick={() => openForm(communicationFolders[0])}>Nueva carga</button></div> : null}</div></section>{modal}</>;
  }
  if (config.moduleKey === "finanzas") {
    const income = store.records.filter((item) => item.category === "Ingreso").reduce((sum, item) => sum + amount(item), 0);
    const expense = store.records.filter((item) => item.category === "Egreso").reduce((sum, item) => sum + amount(item), 0);
    const budget = store.records.filter((item) => item.category === "Presupuesto").reduce((sum, item) => sum + amount(item), 0);
    return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="finance-control"><header><div><span><small>PRESUPUESTO GENERAL</small><b>{money(budget)}</b></span><span><small>INGRESOS</small><b>{money(income)}</b></span><span><small>EGRESOS</small><b>{money(expense)}</b></span><span><small>DISPONIBLE</small><b>{money(income - expense)}</b></span></div><aside className="finance-general-explainer"><b>Control financiero integrado</b><p>Los movimientos y comprobantes quedan guardados en Campaign Vault y el balance se recalcula automáticamente.</p></aside><nav><button onClick={() => openForm("Egreso")}>+ Registrar movimiento</button></nav></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="finance-sheet"><div className="finance-row head"><span>Tipo</span><span>Concepto</span><span>Categoría</span><span>Fuente</span><span>Responsable</span><span>Archivo</span><span>Monto</span><span>Acciones</span></div>{store.records.map((record) => <article className="finance-row" key={record.id}><span><em className={record.category === "Ingreso" ? "income" : record.category === "Egreso" ? "expense" : "budget"}>{record.category}</em></span><span><b>{record.title}</b></span><span>{record.details || "—"}</span><span>{String(record.payload?.source || "—")}</span><span>{String(record.payload?.responsible || "—")}</span><span>{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Descargar</button> : "—"}</span><span><b>{money(amount(record))}</b></span><span className="finance-actions"><button className="record-delete-action" onClick={() => void remove(record)}>Eliminar</button></span></article>)}</div></section>{modal}</>;
  }
  if (candidate) {
    const records = store.records.filter((record) => record.category.startsWith(`${candidate[0]}:`));
    return <><section className="section-banner"><div className="candidate-files-live-identity">{candidateMember?.photoUrl ? <img src={candidateMember.photoUrl} alt={`Fotografía de ${candidate[1]}`} /> : <i>{candidate[0].slice(-2)}</i>}<span><small>EXPEDIENTE LEGAL · {candidate[0]}</small><h2>{candidate[1]}</h2><p>{candidate[2]} · archivos vinculados individualmente</p></span></div><div className="section-banner-actions"><Link to={`/municipio/${municipality_code}/estrategia-legal`}>← Todos los candidatos</Link></div></section>{store.message ? <p className="agenda-message">{store.message}</p> : null}<section className="candidate-files candidate-file-categories"><div className="candidate-upload-grid">{candidateCategories.map(([key, eyebrow, detail]) => { const category = `${candidate[0]}:${key}`; const files = records.filter((record) => record.category === category); const isPhoto = key === "Fotografía oficial"; return <article className="candidate-upload-card" key={key}>{isPhoto && candidateMember?.photoUrl ? <img src={candidateMember.photoUrl} alt={`Fotografía de ${candidate[1]}`} /> : null}<small>{eyebrow}</small><b>{key}</b><span>{detail}</span><mark className="candidate-record-owner">Vinculado a {candidate[1]}</mark><em>{isPhoto && candidateMember?.photoUrl ? "Fotografía activa" : `${files.length} ${files.length === 1 ? "archivo" : "archivos"}`}</em>{isPhoto ? <Link to={`/municipio/${municipality_code}/directorio?view=team`}>{candidateMember?.photoUrl ? "Cambiar en CRM" : "Agregar en CRM"}</Link> : <button type="button" onClick={() => openForm(category)}>+ Cargar archivo</button>}{files.map((record) => <p key={record.id}>{hasFile(record) ? <button type="button" onClick={() => void download(record, true)}>{record.title}</button> : record.title}<button type="button" onClick={() => void remove(record)}>Borrar</button></p>)}</article>; })}</div></section>{modal}</>;
  }
  const partyDocuments = store.records.filter((record) => !record.category.match(/^EC\d+:/));
  return <><section className="section-banner"><div className="section-banner-copy"><p>{config.eyebrow}</p><h1>{config.title}</h1><span>{config.description}</span></div></section><section className="legal-hub"><article className="legal-candidates"><header><small>PLANILLA MUNICIPAL</small><h2>Candidatos</h2></header><div>{brand.slate.map((member) => <Link to={`/municipio/${municipality_code}/estrategia-legal?candidate=${member.code}`} key={member.code}><span className="legal-avatar">{member.photoUrl ? <img src={member.photoUrl} alt={`Fotografía de ${member.fullName}`} /> : <i>{member.code.slice(-2)}</i>}</span><span><small>{member.code}</small><b>{member.fullName}</b><em>{member.positionLabel}</em></span><strong>Expediente →</strong></Link>)}</div></article><article className="legal-party"><header><small>ORGANIZACIÓN POLÍTICA</small><h2>Documentos del partido</h2><p>Requisitos, actas, documentos y plantillas.</p><button onClick={() => openForm("Partido")}>+ Agregar documento</button></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="resource-bank-grid">{partyDocuments.map((record) => <article key={record.id}><small>{record.category}</small><h3>{record.title}</h3><p>{record.details || "Sin notas"}</p><footer>{hasFile(record) ? <button type="button" onClick={() => void download(record)}>Descargar</button> : <span /> }<button onClick={() => void remove(record)}>Eliminar</button></footer></article>)}</div></article></section>{modal}</>;
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
