import { loadSharedContent, downloadSharedResource, type SharedContent } from "../data/radarSharedContent";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  deleteCampaignRecord,
  deleteCampaignVaultFile,
  downloadCampaignVaultFile,
  loadCampaignContacts,
  loadCampaignRecords,
  saveCampaignRecord,
  uploadCampaignVaultFile,
  type CampaignContactRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { useV70CampaignBrand } from "./useV70CampaignBrand";
import { V70LocationPicker } from "./V70LocationPicker";

const materialFolders = [
  ["Manuales", "Protocolos operativos y electorales validados."],
  ["Checklists", "Apertura, jornada, cierre y control de evidencias."],
  ["Plantillas", "Formatos reutilizables para campaña y Día D."],
  ["Tutoriales y Capacitación", "Guías en distintos formatos para la campaña y utilización de RADAR."],
] as const;
const physicalTypes = [
  { key: "Vehículo", label: "Vehículos", fields: [["brand", "Marca"], ["line", "Línea"], ["model", "Modelo"], ["plate", "Placa"], ["characteristics", "Características"], ["authorizedUse", "Uso autorizado"]] },
  { key: "Sede", label: "Sedes", fields: [["address", "Dirección exacta"], ["characteristics", "Características"]] },
  { key: "Equipo audiovisual", label: "Equipo audiovisual", fields: [["brand", "Marca"], ["line", "Línea"], ["color", "Color"], ["characteristics", "Características"]] },
  { key: "Material promocional", label: "Material promocional", fields: [["quantity", "Cantidad"], ["characteristics", "Características"]] },
  { key: "Otro recurso", label: "Otros", fields: [["quantity", "Cantidad"], ["specifications", "Especificaciones"]] },
] as const;
const defaultOfficialFolders = ["Fotografías oficiales", "Logotipos", "Piezas de campaña", "Material para medios"];

function filePath(record: CampaignModuleRecord) {
  return typeof record.payload?.file_path === "string" ? record.payload.file_path : "";
}
function fileName(record: CampaignModuleRecord) {
  return String(record.payload?.file_name || record.title);
}
async function deliverRecordFile(record: CampaignModuleRecord, open = false) {
  const path = filePath(record);
  const legacy = typeof record.payload?.file_data === "string" ? record.payload.file_data : "";
  let blob: Blob;
  if (path) blob = await downloadCampaignVaultFile(path, await ensureRadarAccessToken());
  else if (legacy) blob = await (await fetch(legacy)).blob();
  else throw new Error("Este registro no tiene un archivo asociado.");
  const url = URL.createObjectURL(blob);
  if (open) window.open(url, "_blank", "noopener,noreferrer");
  else {
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = fileName(record);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
function PrivateImage({ record }: { record: CampaignModuleRecord }) {
  const [src, setSrc] = useState("");
  useEffect(() => {
    if (!filePath(record)) return;
    let active = true;
    let url = "";
    void ensureRadarAccessToken().then((token) => downloadCampaignVaultFile(filePath(record), token)).then((blob) => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setSrc(url);
    }).catch(() => undefined);
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [record]);
  return src ? <img src={src} alt="" /> : <i>{record.category.slice(0, 2).toUpperCase()}</i>;
}

function InternalViews({ views }: { views: Array<{ key: string; label: string; content: ReactNode }> }) {
  const initial = () => {
    const hash = window.location.hash.replace(/^#/, "");
    return views.some((view) => view.key === hash) ? hash : (views[0]?.key ?? "");
  };
  const [active, setActive] = useState(initial);
  useEffect(() => {
    const sync = () => { const hash = window.location.hash.replace(/^#/, ""); if (views.some((view) => view.key === hash)) setActive(hash); };
    window.addEventListener("hashchange", sync); sync();
    return () => window.removeEventListener("hashchange", sync);
  }, [views]);
  const selected = views.find((view) => view.key === active) ?? views[0];
  if (!selected) return null;
  return <section className="internal-view-shell"><span className="internal-view-mobile-hint" aria-hidden="true">Desliza para ver más opciones →</span><nav className="internal-view-tabs" aria-label="Vistas internas de Recursos">{views.map((view) => <button key={view.key} className={view.key === selected.key ? "active" : ""} onClick={() => { setActive(view.key); window.location.hash = view.key; }} type="button"><span>{view.label}</span></button>)}</nav><div className="internal-view-content" data-view={selected.key}>{selected.content}</div></section>;
}

function useCampaignRecords(moduleKey: string) {
  const { campaign_id } = useMunicipalityContext();
  const [records, setRecords] = useState<CampaignModuleRecord[]>([]);
  const [message, setMessage] = useState("");
  const load = async () => {
    if (!campaign_id) return;
    try { setRecords(await loadCampaignRecords(campaign_id, moduleKey, await ensureRadarAccessToken())); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar esta área."); }
  };
  useEffect(() => { void load(); }, [campaign_id, moduleKey]);
  return { campaign_id, records, setRecords, message, setMessage };
}

function Materials() {
 const { campaign_id }=useMunicipalityContext();const [folder,setFolder]=useState<string|null>(null);const [records,setRecords]=useState<SharedContent[]>([]);const [message,setMessage]=useState("");
 useEffect(()=>{let live=true;void loadSharedContent(campaign_id).then(rows=>{if(live)setRecords(rows.filter(r=>r.kind==="resource"));}).catch(e=>{if(live)setMessage(e.message);});return()=>{live=false;};},[campaign_id]);
 const assets=records.filter(r=>r.category===folder);
 return <><div className="preloaded-resource-grid">{materialFolders.map(([title,detail])=><article key={title}><i>▤</i><b>{title}</b><span>{detail}</span><button type="button" onClick={()=>setFolder(title)}>Abrir · {records.filter(r=>r.category===title).length}</button></article>)}</div>{message&&<p role="status">{message}</p>}{folder&&<div className="agenda-modal" role="dialog" aria-modal="true"><section className="materials-folder-modal"><header><div><small>BIBLIOTECA RADAR</small><h2>{folder}</h2></div><button aria-label="Cerrar" onClick={()=>setFolder(null)}>×</button></header><div>{assets.length?assets.map(record=><article key={record.id}><span><b>{record.title}</b><small>{record.body} · Versión {record.version}</small></span><button type="button" onClick={()=>void downloadSharedResource(record).catch(e=>setMessage(e.message))}>Descargar</button></article>):<p>No hay documentos publicados en esta carpeta todavía.</p>}</div></section></div>}</>;
}

type PhysicalForm = { type: string; customType: string; name: string; responsible: string; pilot: string; notes: string; latitude: string; longitude: string; locationName: string; values: Record<string, string> };
const emptyPhysical: PhysicalForm = { type: "Vehículo", customType: "", name: "", responsible: "", pilot: "", notes: "", latitude: "", longitude: "", locationName: "", values: {} };

function Physical() {
  const store = useCampaignRecords("recursos");
  const [people, setPeople] = useState<CampaignContactRecord[]>([]);
  const [active, setActive] = useState("Vehículo");
  const [open, setOpen] = useState(false);
  const [picker, setPicker] = useState(false);
  const [form, setForm] = useState<PhysicalForm>(emptyPhysical);
  const [photo, setPhoto] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (store.campaign_id) void ensureRadarAccessToken().then((token) => loadCampaignContacts(store.campaign_id!, token)).then(setPeople).catch(() => undefined); }, [store.campaign_id]);
  const definition = physicalTypes.find((item) => item.key === active) ?? physicalTypes[0];
  const visible = store.records.filter((record) => record.category === active && record.status !== "ARCHIVADO");
  function begin(key: string) { setActive(key); setForm({ ...emptyPhysical, type: key, values: {} }); setPhoto(null); store.setMessage(""); setOpen(true); }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!store.campaign_id) return; setSaving(true); store.setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const stored = photo ? await uploadCampaignVaultFile(store.campaign_id, "recursos", photo, token) : null;
      const saved = await saveCampaignRecord(store.campaign_id, { module_key: "recursos", category: form.type, title: form.name, details: form.notes || null, status: "COMPLETADO", payload: { ...form.values, custom_type: form.customType.trim() || null, responsible: form.responsible || null, pilot: form.pilot || null, latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null, location_name: form.locationName || null, file_path: stored?.path || null, file_name: stored?.file_name || null, mime_type: stored?.mime_type || null, file_size: stored?.file_size || null } }, token);
      store.setRecords((rows) => [saved, ...rows]); setOpen(false); store.setMessage("Recurso guardado y disponible para Logística.");
    } catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo guardar el recurso."); }
    finally { setSaving(false); }
  }
  async function remove(record: CampaignModuleRecord) {
    if (!store.campaign_id || !window.confirm(`¿Eliminar “${record.title}”?`)) return;
    try { const token = await ensureRadarAccessToken(); if (filePath(record)) await deleteCampaignVaultFile(filePath(record), token); await deleteCampaignRecord(store.campaign_id, record.id, token); store.setRecords((rows) => rows.filter((item) => item.id !== record.id)); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo eliminar el recurso."); }
  }
  return <section className="physical-bank"><div className="physical-resource-types">{physicalTypes.map((item) => <button type="button" key={item.key} className={active === item.key ? "active" : ""} onClick={() => begin(item.key)} aria-label={`Agregar ${item.label.toLowerCase()}`}><b>{store.records.filter((record) => record.category === item.key && record.status !== "ARCHIVADO").length}</b><span>{item.label}</span><small><i>+</i> Agregar</small></button>)}</div><header className="physical-bank-bar"><div><small>BANCO DE RECURSOS</small><h2>{definition.label}</h2></div><button onClick={() => begin(active)}>+ Agregar {definition.label.toLowerCase()}</button></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="physical-bank-list">{visible.length ? visible.map((record) => <article key={record.id}><div>{filePath(record) ? <PrivateImage record={record} /> : <i>{record.category.slice(0, 2).toUpperCase()}</i>}</div><span><small>{record.category}</small><b>{record.title}</b><em>{String(record.payload.responsible || "Sin responsable")}</em><p>{[record.payload.brand, record.payload.line, record.payload.model, record.payload.plate, record.payload.quantity].filter(Boolean).join(" · ")}</p></span><nav>{filePath(record) ? <button type="button" onClick={() => void deliverRecordFile(record).catch((error: Error) => store.setMessage(error.message))}>Descargar</button> : null}<button className="danger" onClick={() => void remove(record)}>Eliminar</button></nav></article>) : <div className="agenda-empty"><b>No hay {definition.label.toLowerCase()} registrados.</b><button onClick={() => begin(active)}>Agregar el primero</button></div>}</div>
    {open ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="logistics-modal physical-resource-modal" onSubmit={submit}><header><div><small>BANCO DE RECURSOS</small><h2>{definition.label}</h2></div><button type="button" aria-label="Cerrar" onClick={() => setOpen(false)}>×</button></header><div className="logistics-form-grid"><label><span>Tipo</span><select value={form.customType ? "OTRO" : form.type} onChange={(event) => setForm({ ...form, customType: event.target.value === "OTRO" ? " " : "" })}><option value={form.type}>{definition.label.replace(/s$/, "")}</option><option value="OTRO">Otro</option></select></label>{form.customType ? <label><span>Especificar</span><input required value={form.customType.trimStart()} onChange={(event) => setForm({ ...form, customType: event.target.value })} /></label> : null}<label className="wide"><span>Nombre</span><input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={active === "Equipo audiovisual" ? "Televisor, bocina, micrófono…" : active === "Material promocional" ? "Manta, banner, roll-up…" : "Nombre del recurso"} /></label>{definition.fields.map(([key, label]) => <label className={["characteristics", "authorizedUse", "specifications", "address"].includes(key) ? "wide" : ""} key={key}><span>{label}</span><input value={form.values[key] ?? ""} onChange={(event) => setForm({ ...form, values: { ...form.values, [key]: event.target.value } })} /></label>)}{active === "Sede" ? <div className="wide resource-location-field"><span>Ubicación en mapa</span>{form.latitude ? <iframe title="Vista de la sede en el mapa" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?bbox=${Number(form.longitude) - 0.008}%2C${Number(form.latitude) - 0.006}%2C${Number(form.longitude) + 0.008}%2C${Number(form.latitude) + 0.006}&layer=mapnik&marker=${form.latitude}%2C${form.longitude}`} /> : null}<button className="resource-map-button" type="button" onClick={() => setPicker(true)}>{form.latitude ? `${form.locationName || "Punto seleccionado"} · Cambiar ubicación` : "Seleccionar punto en el mapa"}</button></div> : null}<label><span>Responsable CRM</span><input list="resource-people" value={form.responsible} onChange={(event) => setForm({ ...form, responsible: event.target.value })} /></label>{active === "Vehículo" ? <label><span>Piloto CRM</span><input list="resource-people" value={form.pilot} onChange={(event) => setForm({ ...form, pilot: event.target.value })} /></label> : null}<datalist id="resource-people">{people.map((person) => <option key={person.id} value={person.full_name} />)}</datalist><label className="wide"><span>Fotografía</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label><label className="wide"><span>Notas</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label></div>{store.message ? <p className="form-error">{store.message}</p> : null}<footer><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar recurso"}</button></footer></form></div> : null}
    {picker ? <div className="agenda-modal" role="dialog" aria-modal="true"><V70LocationPicker routeMode={false} latitude={Number(form.latitude) || undefined} longitude={Number(form.longitude) || undefined} points={[]} color="#C47A5A" onClose={() => setPicker(false)} onConfirm={(value) => { setForm({ ...form, latitude: String(value.latitude), longitude: String(value.longitude), locationName: value.locationName || "Ubicación seleccionada" }); setPicker(false); }} /></div> : null}</section>;
}

function Official() {
  const store = useCampaignRecords("medios");
  const { contacts, identity } = useV70CampaignBrand();
  const [folder, setFolder] = useState("Todos");
  const [upload, setUpload] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [title, setTitle] = useState("");
  const [assetFolder, setAssetFolder] = useState(defaultOfficialFolders[0]);
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const folderRecords = store.records.filter((record) => record.category === "Carpeta" && record.status !== "ARCHIVADO");
  const folders = useMemo(() => Array.from(new Set([...defaultOfficialFolders, ...folderRecords.map((record) => record.title)])), [folderRecords]);
  const assets = store.records.filter((record) => record.category !== "Carpeta" && record.status !== "ARCHIVADO" && (folder === "Todos" || record.category === folder));
  const synced = [
    ...contacts.filter((contact) => contact.photo_url && contact.candidate_position).map((contact) => ({ id: `contact-${contact.id}`, category: "Fotografías oficiales", title: `Fotografía oficial · ${contact.full_name}`, detail: `${contact.candidate_position} · sincronizada con su tarjeta CRM`, src: contact.photo_url! })),
    ...(identity.party_logo_data_url ? [{ id: "party-logo", category: "Logotipos", title: `Logotipo oficial · ${identity.party_name || "Partido"}`, detail: "Sincronizado con la identidad definida en Inicio", src: identity.party_logo_data_url }] : []),
  ].filter((asset) => folder === "Todos" || asset.category === folder);
  async function createFolder(event: FormEvent) {
    event.preventDefault(); if (!store.campaign_id || !folderName.trim()) return; setSaving(true);
    try { const saved = await saveCampaignRecord(store.campaign_id, { module_key: "medios", category: "Carpeta", title: folderName.trim(), status: "COMPLETADO", payload: {} }, await ensureRadarAccessToken()); store.setRecords((rows) => [saved, ...rows]); setAssetFolder(folderName.trim()); setFolderName(""); setNewFolder(false); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo crear la carpeta."); } finally { setSaving(false); }
  }
  async function uploadAsset(event: FormEvent) {
    event.preventDefault(); if (!store.campaign_id || !file || !title.trim()) return; setSaving(true); store.setMessage("");
    try { const token = await ensureRadarAccessToken(); const stored = await uploadCampaignVaultFile(store.campaign_id, "medios", file, token); const saved = await saveCampaignRecord(store.campaign_id, { module_key: "medios", category: assetFolder, title: title.trim(), status: "COMPLETADO", payload: { file_path: stored.path, file_name: stored.file_name, file_size: stored.file_size, mime_type: stored.mime_type } }, token); store.setRecords((rows) => [saved, ...rows]); setUpload(false); setTitle(""); setFile(null); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo subir la pieza."); } finally { setSaving(false); }
  }
  async function move(record: CampaignModuleRecord, category: string) {
    if (!store.campaign_id || category === record.category) return;
    try { const saved = await saveCampaignRecord(store.campaign_id, { module_key: record.module_key, category, title: record.title, details: record.details, status: record.status, payload: record.payload }, await ensureRadarAccessToken(), record.id); store.setRecords((rows) => rows.map((item) => item.id === saved.id ? saved : item)); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo mover el archivo."); }
  }
  async function remove(record: CampaignModuleRecord) {
    if (!store.campaign_id || !window.confirm(`¿Borrar “${record.title}”?`)) return;
    try { const token = await ensureRadarAccessToken(); if (filePath(record)) await deleteCampaignVaultFile(filePath(record), token); await deleteCampaignRecord(store.campaign_id, record.id, token); store.setRecords((rows) => rows.filter((item) => item.id !== record.id)); }
    catch (error) { store.setMessage(error instanceof Error ? error.message : "No se pudo borrar el archivo."); }
  }
  return <section className="communication-library"><header><nav><button className={folder === "Todos" ? "active" : ""} onClick={() => setFolder("Todos")}>Todo</button>{folders.map((item) => <button className={folder === item ? "active" : ""} key={item} onClick={() => setFolder(item)}>{item}</button>)}</nav><div><button className="secondary" onClick={() => setNewFolder(true)}>+ Carpeta</button><button onClick={() => setUpload(true)}>+ Nueva carga</button></div></header>{store.message ? <p className="agenda-message">{store.message}</p> : null}<div className="communication-album">{synced.map((asset) => <article className="communication-asset communication-synced" key={asset.id}><a className="communication-preview" href={asset.src} target="_blank" rel="noreferrer"><div><img src={asset.src} alt={asset.title} /></div><span><b>{asset.title}</b><small>{asset.category}</small><em>{asset.detail}</em></span></a><div className="communication-asset-actions"><a href={asset.src} download>Descargar</a><span className="communication-sync-label">VINCULADO AUTOMÁTICAMENTE</span></div></article>)}{assets.map((record) => <article className="communication-asset" key={record.id}><button type="button" className="communication-preview" onClick={() => void deliverRecordFile(record, true).catch((error: Error) => store.setMessage(error.message))}><div>{String(record.payload.mime_type || "").startsWith("image/") ? <PrivateImage record={record} /> : <i>ARCHIVO</i>}</div><span><b>{record.title}</b><small>{record.category}</small></span></button><div className="communication-asset-actions"><label><span>Mover</span><select value={record.category} onChange={(event) => void move(record, event.target.value)}>{folders.map((item) => <option key={item}>{item}</option>)}</select></label><button type="button" onClick={() => void deliverRecordFile(record).catch((error: Error) => store.setMessage(error.message))}>Descargar</button><button type="button" onClick={() => void remove(record)}>Borrar</button></div></article>)}{!synced.length && !assets.length ? <div className="communication-empty"><b>Banco oficial listo para recibir piezas.</b><span>Carga fotografías, logotipos y materiales aprobados de campaña.</span><button onClick={() => setUpload(true)}>Nueva carga</button></div> : null}</div>
    {newFolder ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal" onSubmit={createFolder}><header><div><small>COMUNICACIÓN</small><h2>Nueva carpeta</h2></div><button type="button" onClick={() => setNewFolder(false)}>×</button></header><label><span>Nombre de la carpeta</span><input autoFocus required value={folderName} onChange={(event) => setFolderName(event.target.value)} /></label><footer><button type="button" onClick={() => setNewFolder(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Crear carpeta"}</button></footer></form></div> : null}
    {upload ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="simple-campaign-modal" onSubmit={uploadAsset}><header><div><small>BANCO OFICIAL</small><h2>Nueva carga</h2></div><button type="button" onClick={() => setUpload(false)}>×</button></header><label><span>Nombre de la pieza</span><input required value={title} onChange={(event) => setTitle(event.target.value)} /></label><label><span>Carpeta</span><select value={assetFolder} onChange={(event) => setAssetFolder(event.target.value)}>{folders.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Archivo</span><input required type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label><footer><button type="button" onClick={() => setUpload(false)}>Cancelar</button><button disabled={saving}>{saving ? "Subiendo…" : "Guardar pieza"}</button></footer></form></div> : null}</section>;
}

function ResourcesContent() {
  const views = [
    { key: "materiales", label: "Materiales", content: <section className="resources-workspace"><header><small>BIBLIOTECA</small><h2>Documentos precargados</h2></header><Materials /></section> },
    { key: "fisicos", label: "Recursos físicos", content: <section className="resources-workspace"><header><small>BANCO DE RECURSOS</small><h2>Recursos físicos</h2><p>Vehículos, sedes, equipo audiovisual, materiales promocionales y otros activos.</p></header><Physical /></section> },
    { key: "oficiales", label: "Archivos oficiales", content: <section className="resources-workspace"><header><small>CONEXIÓN CON COMUNICACIÓN, AGENDA Y DIRECTORIO</small><h2>Archivos oficiales</h2><p>Fotografías del candidato, materiales aprobados, logotipo del partido y fotografías de actividades.</p></header><Official /></section> },
  ];
  return <><section className="section-banner"><div className="section-banner-copy"><p>INVENTARIO OPERATIVO</p><h1>Recursos</h1><span>Documentos, activos físicos y archivos oficiales de campaña</span></div></section><InternalViews views={views} /></>;
}

export function V70DirectResources0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="recursos" eyebrow="OPERACIÓN" topbarTitle={municipalityTitle}><ResourcesContent /></V70DirectShell0509></MunicipalityProvider>;
}
