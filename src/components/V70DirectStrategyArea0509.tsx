import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  deleteCampaignRecord,
  loadCampaignRecords,
  saveCampaignRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { V70DirectShell0509 } from "./V70DirectShell0509";

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
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    const latest = new Map<string, CampaignModuleRecord>();
    store.records.forEach((record) => { if (!latest.has(record.category)) latest.set(record.category, record); });
    setDrafts(Object.fromEntries(planFields.map(([field]) => {
      const record = latest.get(field);
      return [field, [record?.title, record?.details].filter(Boolean).join("\n")];
    })));
  }, [store.records]);
  const latestByCategory = useMemo(() => new Map(store.records.map((record) => [record.category, record])), [store.records]);
  const changed = planFields.filter(([field]) => {
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
  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>PLAN DE CAMPAÑA</p><h1>Estrategia electoral</h1><span>Diagnóstico, objetivos y decisiones vigentes</span></div></section>
    <section className="strategy-workspace">
      {store.message ? <div className="agenda-message strategy-message">{store.message}</div> : null}
      <div className="strategy-opening-grid"><article className="strategy-radar-reading"><h2>Lectura inicial</h2><ul><li>El padrón aumentó en <b>1,956 electores</b> frente al universo enlazado de 2023.</li><li>La cobertura electoral se organiza alrededor de <b>13 centros y 103 JRV</b>.</li><li>La campaña debe definir su posición, meta de votos y mensaje central.</li></ul><Link to="/municipio/0509/mapa">Revisar territorio en el mapa →</Link></article></div>
      <header className="strategy-command-bar"><div className="strategy-plan-state"><b>Plan 0509</b><span>BORRADOR · {store.records.length}/{planFields.length} campos</span></div><div><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : `Guardar cambios${changed.length ? ` (${changed.length})` : ""}`}</button></div></header>
      <article className="strategy-direct-form"><div className="strategy-form-heading"><div><h2>Campaña electoral</h2><p>Escribe directamente. Los textos guardados quedan visibles y siempre pueden modificarse.</p></div></div><div className="strategy-form-grid">{planFields.slice(0, 4).map(([field, prompt]) => <label key={field}><span>{field}</span><textarea rows={field === "Mensaje central" ? 7 : 5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? "Guardado en Campaign Vault" : "Pendiente"}</small></label>)}</div><div className="strategy-form-divider"><span>FODA</span></div><div className="strategy-form-grid foda">{planFields.slice(4).map(([field, prompt]) => <label key={field}><span>{field === "Fortaleza" ? "Fortalezas" : field === "Debilidad" ? "Debilidades" : field === "Oportunidad" ? "Oportunidades" : "Amenazas"}</span><textarea rows={5} value={drafts[field] ?? ""} onChange={(event) => setDrafts({ ...drafts, [field]: event.target.value })} placeholder={prompt} /><small>{latestByCategory.has(field) ? "Guardado en Campaign Vault" : "Pendiente"}</small></label>)}</div><footer className="strategy-form-footer"><span>Al guardar se registra tu usuario y la fecha.</span><button disabled={saving || !changed.length} onClick={() => void save()}>{saving ? "Guardando…" : "Guardar cambios"}</button></footer></article>
    </section>
  </>;
}

function RecordsWorkspace({ config }: { config: (typeof areaConfig)[keyof typeof areaConfig] }) {
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
