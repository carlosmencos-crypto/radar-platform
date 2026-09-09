import { useMemo, useState, type FormEvent } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import {
  deleteDemoActivity,
  deleteDemoContact,
  saveDemoActivity,
  saveDemoContact,
  saveDemoFiscal,
  saveDemoIncident,
  saveDemoResource,
  type ActivityDraft,
  type ContactDraft,
  type FiscalDraft,
  type IncidentDraft,
  type ResourceDraft,
} from "../data/demoVault";
import { supabase } from "../lib/supabase";
import type {
  DemoActivity,
  DemoContact,
  DemoFiscal,
  DemoGeoFeature,
  DemoIncident,
  DemoResource,
  RadarDemoBundle,
} from "../types/radar";

const numberFormat = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala" });

function CampaignSectionHeader({ eyebrow, title, description, isDemo }: { eyebrow: string; title: string; description: string; isDemo: boolean }) {
  return <section className="section-banner">
    <div className="section-banner-copy"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
    <div className="section-banner-actions"><span className="demo-badge">{isDemo ? "DEMO · SINTÉTICO" : "SESIÓN AUTORIZADA"}</span></div>
  </section>;
}

function WorkspaceUnavailable({ title }: { title: string }) {
  const { consumer } = useMunicipalityContext();
  return <section className="canonical-protected-page">
    <div className="canonical-lockmark" aria-hidden="true">◇</div><small>CAMPAIGN VAULT</small>
    <h2>{title} requiere una campaña autorizada</h2>
    <p>El componente V70 está activo, pero esta sesión no recibió registros operativos para la campaña {consumer.context.campaign_id}.</p>
  </section>;
}

function MutationMessage({ value }: { value: string }) {
  return value ? <p className="demo-mutation-message" role="status">{value}</p> : null;
}

function formatDate(value: string | null) {
  if (!value) return "Fecha por definir";
  return dateFormat.format(new Date(value));
}

function initials(value: string) {
  return value.split(/\s+/).map((part) => part[0]).slice(0, 2).join("").toUpperCase();
}

function useWorkspace(): { workspace?: RadarDemoBundle; isDemo: boolean; canWrite: boolean } {
  const { consumer } = useMunicipalityContext();
  return {
    workspace: consumer.demo,
    isDemo: consumer.is_demo,
    canWrite: consumer.is_demo && consumer.context.permissions.includes("demo_vault:write"),
  };
}

export function CampaignStrategy() {
  const { workspace, isDemo } = useWorkspace();
  const [view, setView] = useState<"plan" | "scenarios" | "priorities">("plan");
  const items = workspace?.strategy_items ?? [];
  const visibleItems = view === "plan" ? items : items.filter((item) => view === "scenarios" ? item.item_type.toLowerCase().includes("escenario") : !item.item_type.toLowerCase().includes("escenario"));
  return <>
    <CampaignSectionHeader eyebrow="ESTRATEGIA DE CAMPAÑA" title="Estrategia" description="Metas, hitos, escenarios y prioridades" isDemo={isDemo} />
    {!workspace ? <WorkspaceUnavailable title="Estrategia" /> : <section className="strategy-workspace campaign-workspace" data-campaign-module="estrategia" data-demo-count={items.length}>
      <div className="strategy-command-bar campaign-tabs" role="tablist" aria-label="Vistas de estrategia">
        <button className={view === "plan" ? "active" : ""} onClick={() => setView("plan")}>Plan estratégico</button>
        <button className={view === "scenarios" ? "active" : ""} onClick={() => setView("scenarios")}>Escenarios</button>
        <button className={view === "priorities" ? "active" : ""} onClick={() => setView("priorities")}>Prioridades</button>
      </div>
      <div className="strategy-goals-radar">
        {visibleItems.map((item) => {
          const target = Number(item.target_value ?? 0); const current = Number(item.current_value ?? 0);
          const progress = target > 0 ? Math.min(100, current / target * 100) : 0;
          return <article key={item.id}><header><span>{item.item_type.toUpperCase()}</span><em>{item.status}</em></header><h3>{item.title}</h3><p>{item.description}</p><div className="demo-progress"><i style={{ width: `${progress}%` }} /></div><footer><b>{numberFormat.format(current)} / {numberFormat.format(target)}</b><small>{item.due_date ?? "Sin fecha"}</small></footer></article>;
        })}
      </div>
      <aside className="strategy-radar-reading"><small>LECTURA RADAR</small><h3>Prioridades de campaña</h3><p>{items.length} líneas estratégicas conectadas a la campaña. Los avances se calculan sin alterar el dato de origen.</p></aside>
    </section>}
  </>;
}

const emptyContact: ContactDraft = { full_name: "", phone: "", community: "", address_text: "", status: "base", notes: "" };

function ContactEditor({ initial, onDone }: { initial: DemoContact | null; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext();
  const [draft, setDraft] = useState<ContactDraft>(initial ? { full_name: initial.full_name, phone: initial.phone ?? "", community: initial.community ?? "", address_text: initial.address_text ?? "", status: initial.status, notes: initial.notes ?? "" } : emptyContact);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); try { await saveDemoContact(campaign_id, initial?.id ?? null, draft); await onDone(); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar el contacto."); } finally { setBusy(false); } }
  return <form className="demo-editor crm-person-form" onSubmit={(event) => void submit(event)}>
    <label><span>Nombre</span><input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
    <label><span>Teléfono</span><input value={draft.phone ?? ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
    <label><span>Comunidad</span><input value={draft.community ?? ""} onChange={(event) => setDraft({ ...draft, community: event.target.value })} /></label>
    <label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="base">Base</option><option value="contactado">Contactado</option><option value="seguimiento">Seguimiento</option></select></label>
    <label className="wide"><span>Dirección</span><input value={draft.address_text ?? ""} onChange={(event) => setDraft({ ...draft, address_text: event.target.value })} /></label>
    <label className="wide"><span>Notas</span><textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <footer><button type="button" onClick={() => void onDone()}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar contacto"}</button></footer><MutationMessage value={message} />
  </form>;
}

export function CampaignDirectory() {
  const { consumer, campaign_id, refresh } = useMunicipalityContext();
  const { workspace, isDemo, canWrite } = useWorkspace();
  const contacts = workspace?.contacts ?? [];
  const [editing, setEditing] = useState<DemoContact | null | undefined>(undefined); const [message, setMessage] = useState("");
  const [query, setQuery] = useState(""); const [view, setView] = useState<"cards" | "table">("cards");
  const visible = contacts.filter((contact) => `${contact.full_name} ${contact.community ?? ""} ${contact.phone ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  async function closeEditor() { setEditing(undefined); await refresh(); }
  async function remove(contact: DemoContact) { if (!window.confirm(`¿Eliminar a ${contact.full_name} de la demo?`)) return; setMessage(""); try { await deleteDemoContact(campaign_id, contact.id); await refresh(); setMessage("Contacto eliminado."); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible eliminar el contacto."); } }
  return <>
    <CampaignSectionHeader eyebrow="DIRECTORIO TERRITORIAL" title="Directorio" description="CRM, búsqueda y fichas de contacto" isDemo={isDemo} />
    {!workspace ? <WorkspaceUnavailable title="Directorio" /> : <section className="crm-directory crm-directory-v2 campaign-workspace" data-campaign-module="directorio" data-demo-count={contacts.length}>
      <header className="crm-head"><div><small>CRM TERRITORIAL</small><h2>{contacts.length} contactos</h2></div>{canWrite ? <button className="primary" type="button" onClick={() => setEditing(null)}>+ Nuevo contacto</button> : null}</header>
      <div className="crm-controlbar"><label className="crm-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, comunidad o teléfono" /></label><div className="crm-view-switch"><button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Tarjetas</button><button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Tabla</button></div></div>
      {editing !== undefined ? <ContactEditor key={editing?.id ?? "new"} initial={editing} onDone={closeEditor} /> : null}<MutationMessage value={message} />
      <div className={view === "cards" ? "crm-card-grid" : "crm-table-v2"}>{visible.map((contact) => <article className="crm-contact-card" key={contact.id}><div className="crm-avatar">{initials(contact.full_name)}</div><div className="crm-person-name"><small>{contact.community ?? "Comunidad por definir"}</small><h3>{contact.full_name}</h3><p>{contact.phone ?? "Sin teléfono"}</p><span>{contact.notes}</span></div><em className="crm-status">{contact.status}</em>{canWrite ? <footer className="crm-card-actions"><button onClick={() => setEditing(contact)}>Editar</button><button onClick={() => void remove(contact)}>Eliminar</button></footer> : null}</article>)}</div>
      {!visible.length ? <p className="agenda-empty">Sin coincidencias para “{query}”.</p> : null}
      <small className="campaign-source-note">{isDemo ? "Demo Vault · datos sintéticos" : `Campaign Vault · ${consumer.context.campaign_id}`}</small>
    </section>}
  </>;
}

const emptyActivity: ActivityDraft = { title: "", activity_type: "reunion", starts_at: "", community: "", latitude: null, longitude: null, status: "planned", notes: "" };

function ActivityEditor({ initial, onDone }: { initial: DemoActivity | null; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext();
  const [draft, setDraft] = useState<ActivityDraft>(initial ? { title: initial.title, activity_type: initial.activity_type ?? "reunion", starts_at: initial.starts_at?.slice(0, 16) ?? "", community: initial.community ?? "", latitude: initial.latitude, longitude: initial.longitude, status: initial.status, notes: initial.notes ?? "" } : emptyActivity);
  const [busy, setBusy] = useState(false); const [message, setMessage] = useState("");
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); setMessage(""); const startsAt = draft.starts_at ? new Date(draft.starts_at).toISOString() : null; try { await saveDemoActivity(campaign_id, initial?.id ?? null, { ...draft, starts_at: startsAt }); await onDone(); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar la actividad."); } finally { setBusy(false); } }
  return <form className="demo-editor agenda-form-grid" onSubmit={(event) => void submit(event)}><label className="wide"><span>Actividad</span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label><label><span>Tipo</span><select value={draft.activity_type ?? "reunion"} onChange={(event) => setDraft({ ...draft, activity_type: event.target.value })}><option value="reunion">Reunión</option><option value="recorrido">Recorrido</option><option value="evento">Evento</option><option value="territorio">Territorio</option><option value="mesa_tecnica">Mesa técnica</option></select></label><label><span>Fecha y hora</span><input type="datetime-local" value={draft.starts_at ?? ""} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} /></label><label><span>Comunidad</span><input value={draft.community ?? ""} onChange={(event) => setDraft({ ...draft, community: event.target.value })} /></label><label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="planned">Planificada</option><option value="confirmada">Confirmada</option><option value="completada">Completada</option></select></label><label className="wide"><span>Notas</span><textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label><footer><button type="button" onClick={() => void onDone()}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar actividad"}</button></footer><MutationMessage value={message} /></form>;
}

export function CampaignAgenda() {
  const { campaign_id, refresh } = useMunicipalityContext(); const { workspace, isDemo, canWrite } = useWorkspace();
  const activities = workspace?.activities ?? []; const [editing, setEditing] = useState<DemoActivity | null | undefined>(undefined); const [message, setMessage] = useState(""); const [view, setView] = useState<"list" | "calendar">("list");
  async function closeEditor() { setEditing(undefined); await refresh(); }
  async function remove(activity: DemoActivity) { if (!window.confirm(`¿Eliminar “${activity.title}”?`)) return; try { await deleteDemoActivity(campaign_id, activity.id); await refresh(); setMessage("Actividad eliminada."); } catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible eliminar la actividad."); } }
  return <><CampaignSectionHeader eyebrow="OPERACIÓN TERRITORIAL" title="Agenda" description="Lista, calendario y operación territorial" isDemo={isDemo} />
    {!workspace ? <WorkspaceUnavailable title="Agenda" /> : <section className="agenda-workspace campaign-workspace" data-campaign-module="agenda" data-demo-count={activities.length}>
      <div className="agenda-viewbar"><div><small>PRÓXIMAS ACTIVIDADES</small><h2>{activities.length} actividades</h2></div><div className="campaign-tabs"><button className={view === "list" ? "active" : ""} onClick={() => setView("list")}>Lista</button><button className={view === "calendar" ? "active" : ""} onClick={() => setView("calendar")}>Calendario</button>{canWrite ? <button className="primary" onClick={() => setEditing(null)}>+ Nueva actividad</button> : null}</div></div>
      {editing !== undefined ? <ActivityEditor key={editing?.id ?? "new"} initial={editing} onDone={closeEditor} /> : null}<MutationMessage value={message} />
      <div className={view === "list" ? "demo-agenda-list" : "agenda-calendar"}>{activities.map((activity) => <article key={activity.id}><time>{formatDate(activity.starts_at)}</time><div><small>{activity.activity_type?.replaceAll("_", " ")}</small><h3>{activity.title}</h3><p>{activity.community} · {activity.notes}</p></div><em>{activity.status}</em>{canWrite ? <footer className="agenda-actions"><button onClick={() => setEditing(activity)}>Editar</button><button onClick={() => void remove(activity)}>Eliminar</button></footer> : null}</article>)}</div>
    </section>}
  </>;
}

type DayDTab = "control" | "centros" | "jrv" | "fiscales" | "incidencias" | "logistica" | "rtd";
const dayDTabs: Array<[DayDTab, string]> = [["control", "Centro de control"], ["centros", "Centros de votación"], ["jrv", "JRV"], ["fiscales", "Fiscales"], ["incidencias", "Incidencias"], ["logistica", "Logística"], ["rtd", "RTD"]];

function FiscalEditor({ fiscal, centers, onDone }: { fiscal: DemoFiscal; centers: DemoGeoFeature[]; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext(); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<FiscalDraft>({ full_name: fiscal.full_name, phone: fiscal.phone, voting_center_code: fiscal.voting_center_code, jrv_code: fiscal.jrv_code, status: fiscal.status });
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await saveDemoFiscal(campaign_id, fiscal.id, draft); await onDone(); } finally { setBusy(false); } }
  return <form className="day-d-assignment-form" onSubmit={(event) => void submit(event)}><label><span>Fiscal</span><input value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label><label><span>Centro</span><select value={draft.voting_center_code ?? ""} onChange={(event) => setDraft({ ...draft, voting_center_code: event.target.value })}>{centers.map((center) => <option key={center.id} value={center.feature_code}>{center.feature_code} · {center.feature_name}</option>)}</select></label><label><span>JRV</span><input value={draft.jrv_code ?? ""} onChange={(event) => setDraft({ ...draft, jrv_code: event.target.value })} /></label><label><span>Estado/check-in</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="assigned">Asignado</option><option value="checked_in">Check-in</option><option value="alert">Alerta</option><option value="absent">Ausente</option></select></label><button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar asignación"}</button></form>;
}

function IncidentEditor({ centers, onDone }: { centers: DemoGeoFeature[]; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext(); const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<IncidentDraft>({ incident_type: "logistica", severity: "media", description: "", voting_center_code: centers[0]?.feature_code ?? null, jrv_code: "", status: "open" });
  async function submit(event: FormEvent) { event.preventDefault(); setBusy(true); try { await saveDemoIncident(campaign_id, null, draft); await onDone(); } finally { setBusy(false); } }
  return <form className="day-d-quick-form" onSubmit={(event) => void submit(event)}><label><span>Tipo</span><select value={draft.incident_type} onChange={(event) => setDraft({ ...draft, incident_type: event.target.value })}><option value="logistica">Logística</option><option value="acceso">Acceso</option><option value="fiscal">Fiscal</option><option value="tecnica">Técnica</option></select></label><label><span>Severidad</span><select value={draft.severity ?? "media"} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option></select></label><label><span>Centro</span><select value={draft.voting_center_code ?? ""} onChange={(event) => setDraft({ ...draft, voting_center_code: event.target.value })}>{centers.map((center) => <option key={center.id} value={center.feature_code}>{center.feature_code}</option>)}</select></label><label><span>JRV</span><input value={draft.jrv_code ?? ""} onChange={(event) => setDraft({ ...draft, jrv_code: event.target.value })} /></label><label className="wide"><span>Descripción</span><textarea required value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label><button className="primary" disabled={busy}>{busy ? "Reportando…" : "Reportar incidencia"}</button></form>;
}

function FiscalCarnet({ fiscal, center, onClose }: { fiscal: DemoFiscal; center?: DemoGeoFeature; onClose: () => void }) {
  return <div className="agenda-modal" role="dialog" aria-modal="true" aria-label={`Carnet de ${fiscal.full_name}`}><section className="crm-carnet-modal"><header><div><small>FICHA DE FISCAL · V70</small><h2>{fiscal.full_name}</h2></div><button onClick={onClose} aria-label="Cerrar">×</button></header><div className="crm-carnet-preview"><div className="crm-carnet-brand">RADAR ELECTORAL</div><div className="crm-carnet-person"><span>{initials(fiscal.full_name)}</span><div><b>{fiscal.full_name}</b><small>{fiscal.phone ?? "Sin teléfono"}</small></div></div><dl><div><dt>Centro</dt><dd>{fiscal.voting_center_code} · {center?.feature_name ?? "Por definir"}</dd></div><div><dt>JRV</dt><dd>{fiscal.jrv_code ?? "Por definir"}</dd></div><div><dt>Estado</dt><dd>{fiscal.status.replaceAll("_", " ")}</dd></div></dl><strong className="crm-carnet-seal">DEMO · SINTÉTICO</strong></div><footer><button onClick={onClose}>Cerrar</button><button className="primary" onClick={() => window.print()}>Imprimir carnet</button></footer></section></div>;
}

export function CampaignDayD() {
  const { refresh, campaign_id } = useMunicipalityContext(); const { workspace, isDemo, canWrite } = useWorkspace();
  const [tab, setTab] = useState<DayDTab>("control"); const [centerDetail, setCenterDetail] = useState<DemoGeoFeature | null>(null); const [editingFiscal, setEditingFiscal] = useState<DemoFiscal | null>(null); const [carnet, setCarnet] = useState<DemoFiscal | null>(null); const [incidentOpen, setIncidentOpen] = useState(false); const [message, setMessage] = useState("");
  const fiscales = workspace?.fiscales ?? []; const incidents = workspace?.incidents ?? []; const results = workspace?.rtd_results ?? []; const resources = workspace?.resources ?? [];
  const centers = (workspace?.geo_features ?? []).filter((feature) => feature.feature_type === "voting_center");
  const declaredJrv = centers.reduce((total, center) => total + Number(center.properties.jrv ?? 0), 0);
  const jrvRows = centers.flatMap((center, centerIndex, orderedCenters) => {
    const firstNumber = orderedCenters.slice(0, centerIndex).reduce((total, item) => total + Number(item.properties.jrv ?? 0), 0) + 1;
    return Array.from({ length: Number(center.properties.jrv ?? 0) }, (_, index) => `${center.feature_code}/JRV${String(firstNumber + index).padStart(3, "0")}`);
  });
  const monitoredJrv = new Set([...fiscales.map((item) => `${item.voting_center_code}/${item.jrv_code}`), ...results.map((item) => `${item.voting_center_code}/${item.jrv_code}`)]);
  const voteTotals = useMemo(() => { const totals = new Map<string, number>(); for (const result of results) for (const [label, value] of Object.entries(result.results)) totals.set(label, (totals.get(label) ?? 0) + Number(value)); return Array.from(totals, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value); }, [results]);
  const maxVotes = Math.max(1, ...voteTotals.map((item) => item.value));
  async function closeFiscal() { setEditingFiscal(null); await refresh(); setMessage("Asignación y check-in actualizados."); }
  async function quickCheckIn(fiscal: DemoFiscal) { const draft: FiscalDraft = { full_name: fiscal.full_name, phone: fiscal.phone, voting_center_code: fiscal.voting_center_code, jrv_code: fiscal.jrv_code, status: fiscal.status === "checked_in" ? "assigned" : "checked_in" }; await saveDemoFiscal(campaign_id, fiscal.id, draft); await refresh(); }
  async function resolveIncident(incident: DemoIncident) { const draft: IncidentDraft = { incident_type: incident.incident_type, severity: incident.severity, description: incident.description, voting_center_code: incident.voting_center_code, jrv_code: incident.jrv_code, status: "resolved" }; await saveDemoIncident(campaign_id, incident.id, draft); await refresh(); }
  return <><CampaignSectionHeader eyebrow="OPERACIÓN ELECTORAL" title="Día D" description="Centro de control, centros, JRV, fiscales, incidencias, logística y RTD" isDemo={isDemo} />
    {!workspace ? <WorkspaceUnavailable title="Día D" /> : <section className="day-d-workspace campaign-workspace" data-campaign-module="dia-d" data-fiscales-count={fiscales.length} data-rtd-count={results.length} data-centers-count={centers.length} data-jrv-count={declaredJrv}>
      <p className="day-d-demo-mode">SIMULACIÓN · operación sintética aislada de cualquier elección o municipio real.</p>
      <nav className="day-d-command campaign-tabs" aria-label="Submódulos Día D">{dayDTabs.map(([key, label]) => <button className={tab === key ? "active" : ""} key={key} onClick={() => setTab(key)}>{label}</button>)}</nav>
      <div className="day-d-summary"><button onClick={() => setTab("centros")}><small>Centros</small><b>{centers.length}</b><span>ver detalle</span></button><button onClick={() => setTab("jrv")}><small>JRV declaradas</small><b>{declaredJrv}</b><span>{monitoredJrv.size} monitoreadas</span></button><button onClick={() => setTab("fiscales")}><small>Fiscales</small><b>{fiscales.length}</b><span>{fiscales.filter((item) => item.status === "checked_in").length} check-in</span></button><button onClick={() => setTab("incidencias")}><small>Incidencias</small><b>{incidents.length}</b><span>{incidents.filter((item) => item.status === "open").length} abiertas</span></button><button onClick={() => setTab("rtd")}><small>Actas RTD</small><b>{results.length}</b><span>{results.filter((item) => item.status === "submitted").length} transmitidas</span></button></div>
      <MutationMessage value={message} />
      {tab === "control" ? <div className="day-d-opening-grid"><section className="day-d-command"><header><small>CENTRO DE CONTROL</small><h2>Estado operativo</h2></header><div className="day-d-operations-strip"><span><b>{centers.length}/{centers.length}</b><small>centros activos</small></span><span><b>{fiscales.length}</b><small>asignaciones</small></span><span><b>{results.length}</b><small>actas recibidas</small></span><span><b>{resources.length}</b><small>líneas logísticas</small></span></div></section><section className="rtd-seat-projection"><header><div><small>TOTALES RTD</small><h3>Consolidado de resultados recibidos</h3></div><strong>{numberFormat.format(results.reduce((total, item) => total + Number(item.total_ballots ?? 0), 0))} papeletas</strong></header><div className="campaign-bar-chart">{voteTotals.slice(0, 6).map((item) => <span key={item.label}><small>{item.label}</small><i><em style={{ width: `${item.value / maxVotes * 100}%` }} /></i><b>{numberFormat.format(item.value)}</b></span>)}</div></section></div> : null}
      {tab === "centros" ? <section className="day-d-center-list"><header><small>CENTROS DE VOTACIÓN</small><h2>{centers.length} centros sintéticos</h2></header>{centers.map((center) => { const centerFiscales = fiscales.filter((item) => item.voting_center_code === center.feature_code); const centerRtd = results.filter((item) => item.voting_center_code === center.feature_code); return <article key={center.id}><span><b>{center.feature_code} · {center.feature_name}</b><small>{Number(center.properties.electors ?? 0).toLocaleString("es-GT")} electores</small></span><strong>{Number(center.properties.jrv ?? 0)} JRV</strong><em>{centerFiscales.length} fiscales</em><em>{centerRtd.length} actas</em><button onClick={() => setCenterDetail(center)}>Abrir centro</button></article>; })}</section> : null}
      {tab === "jrv" ? <section className="day-d-center-jrv-list" data-jrv-rows={jrvRows.length}><div className="head"><span>Centro/JRV</span><span>Fiscal</span><span>Estado</span><span>RTD</span></div>{jrvRows.map((key) => { const [centerCode, jrvCode] = key.split("/"); const fiscal = fiscales.find((item) => item.voting_center_code === centerCode && item.jrv_code === jrvCode); const actas = results.filter((item) => item.voting_center_code === centerCode && item.jrv_code === jrvCode); return <article key={key}><b>{centerCode} · {jrvCode}</b><span>{fiscal?.full_name ?? "Sin fiscal"}</span><em>{fiscal?.status.replaceAll("_", " ") ?? "pendiente"}</em><strong>{actas.length} actas</strong></article>; })}</section> : null}
      {tab === "fiscales" ? <section className="day-d-fiscal-table"><header><small>RED DE FISCALES</small><h2>Asignación, fichas y check-in</h2></header>{fiscales.map((fiscal) => <article key={fiscal.id}><span className="crm-avatar">{initials(fiscal.full_name)}</span><span><b>{fiscal.full_name}</b><small>{fiscal.phone ?? "Sin teléfono"}</small></span><b>{fiscal.voting_center_code}</b><b>{fiscal.jrv_code}</b><em className={`crm-dayd-status ${fiscal.status}`}>{fiscal.status.replaceAll("_", " ")}</em><div className="day-d-access-actions"><button onClick={() => setCarnet(fiscal)}>Carnet</button>{canWrite ? <><button onClick={() => setEditingFiscal(fiscal)}>Asignar</button><button onClick={() => void quickCheckIn(fiscal)}>{fiscal.status === "checked_in" ? "Desmarcar" : "Check-in"}</button></> : null}</div></article>)}</section> : null}
      {tab === "incidencias" ? <section className="day-d-incident-list"><header><div><small>INCIDENCIAS</small><h2>Seguimiento operativo</h2></div>{canWrite ? <button className="primary" onClick={() => setIncidentOpen((value) => !value)}>+ Reportar incidencia</button> : null}</header>{incidentOpen ? <IncidentEditor centers={centers} onDone={async () => { setIncidentOpen(false); await refresh(); }} /> : null}{incidents.map((incident) => <article key={incident.id}><span><b>{incident.incident_type}</b><small>{incident.voting_center_code} · {incident.jrv_code}</small></span><p>{incident.description}</p><em className={incident.severity ?? "media"}>{incident.severity}</em><strong>{incident.status}</strong>{canWrite && incident.status !== "resolved" ? <button onClick={() => void resolveIncident(incident)}>Marcar resuelta</button> : null}</article>)}</section> : null}
      {tab === "logistica" ? <section><div className="day-d-logistics-grid"><article><small>RECURSOS DISPONIBLES</small><b>{resources.length}</b><span>{numberFormat.format(resources.reduce((total, item) => total + Number(item.quantity ?? 0), 0))} unidades registradas</span></article><article><small>CENTROS CUBIERTOS</small><b>{centers.length}</b><span>Operación sintética</span></article></div><div className="day-d-logistics-table"><div className="head"><span>Recurso</span><span>Tipo</span><span>Cantidad</span><span>Ubicación</span><span>Estado</span><span>Acción</span></div>{resources.map((resource) => <article key={resource.id}><span><b>{resource.name}</b><small>{resource.notes}</small></span><strong>{resource.resource_type}</strong><strong>{numberFormat.format(resource.quantity ?? 0)} {resource.unit}</strong><span>{resource.location}</span><em className={resource.status === "disponible" ? "ready" : "pending"}>{resource.status}</em>{canWrite ? <button onClick={() => void saveDemoResource(campaign_id, resource.id, { resource_type: resource.resource_type, name: resource.name, quantity: resource.quantity, unit: resource.unit, status: resource.status === "disponible" ? "asignado" : "disponible", location: resource.location, notes: resource.notes }).then(refresh)}>Cambiar estado</button> : <span>Lectura</span>}</article>)}</div></section> : null}
      {tab === "rtd" ? <section className="rtd-flow"><div className="rtd-vote-summary"><span><small>Actas</small><b>{results.length}</b></span><span><small>Papeletas</small><b>{numberFormat.format(results.reduce((total, item) => total + Number(item.total_ballots ?? 0), 0))}</b></span><span><small>Blancos</small><b>{numberFormat.format(results.reduce((total, item) => total + Number(item.blank_votes ?? 0), 0))}</b></span><span><small>Nulos</small><b>{numberFormat.format(results.reduce((total, item) => total + Number(item.null_votes ?? 0), 0))}</b></span></div><div className="rtd-results-table"><table><thead><tr><th>Centro/JRV</th><th>Elección</th><th>Papeletas</th><th>Blancos</th><th>Nulos</th><th>Estado</th></tr></thead><tbody>{results.map((result) => <tr key={result.id}><td>{result.voting_center_code} · {result.jrv_code}</td><td>{result.election_type.replaceAll("_", " ")}</td><td>{result.total_ballots ?? "—"}</td><td>{result.blank_votes ?? "—"}</td><td>{result.null_votes ?? "—"}</td><td>{result.status}</td></tr>)}</tbody></table></div><div className="rtd-composition"><header><small>COMPOSICIÓN CONSOLIDADA</small><b>Totales por agrupación</b></header><div className="campaign-bar-chart">{voteTotals.map((item) => <span key={item.label}><small>{item.label}</small><i><em style={{ width: `${item.value / maxVotes * 100}%` }} /></i><b>{numberFormat.format(item.value)}</b></span>)}</div></div></section> : null}
      {editingFiscal ? <div className="agenda-modal"><section className="day-d-center-modal"><header><h2>Asignación de fiscal</h2><button onClick={() => setEditingFiscal(null)}>×</button></header><FiscalEditor fiscal={editingFiscal} centers={centers} onDone={closeFiscal} /></section></div> : null}
      {carnet ? <FiscalCarnet fiscal={carnet} center={centers.find((center) => center.feature_code === carnet.voting_center_code)} onClose={() => setCarnet(null)} /> : null}
      {centerDetail ? <div className="agenda-modal"><section className="day-d-center-modal"><header><div><small>DETALLE DE CENTRO</small><h2>{centerDetail.feature_code} · {centerDetail.feature_name}</h2></div><button onClick={() => setCenterDetail(null)}>×</button></header><div className="day-d-center-modal-summary"><span><small>Electores</small><b>{Number(centerDetail.properties.electors ?? 0).toLocaleString("es-GT")}</b></span><span><small>JRV</small><b>{Number(centerDetail.properties.jrv ?? 0)}</b></span><span><small>Fiscales</small><b>{fiscales.filter((item) => item.voting_center_code === centerDetail.feature_code).length}</b></span><span><small>Actas RTD</small><b>{results.filter((item) => item.voting_center_code === centerDetail.feature_code).length}</b></span></div><div className="day-d-center-jrv-list">{fiscales.filter((item) => item.voting_center_code === centerDetail.feature_code).map((fiscal) => <article key={fiscal.id}><b>{fiscal.jrv_code}</b><span>{fiscal.full_name}</span><em>{fiscal.status}</em></article>)}</div></section></div> : null}
    </section>}
  </>;
}

export function CampaignResources() {
  const { campaign_id, refresh } = useMunicipalityContext(); const { workspace, isDemo, canWrite } = useWorkspace(); const resources = workspace?.resources ?? []; const [filter, setFilter] = useState("todos");
  const types = Array.from(new Set(resources.map((item) => item.resource_type))); const visible = filter === "todos" ? resources : resources.filter((item) => item.resource_type === filter);
  async function toggle(resource: DemoResource) { const draft: ResourceDraft = { resource_type: resource.resource_type, name: resource.name, quantity: resource.quantity, unit: resource.unit, status: resource.status === "disponible" ? "asignado" : "disponible", location: resource.location, notes: resource.notes }; await saveDemoResource(campaign_id, resource.id, draft); await refresh(); }
  return <><CampaignSectionHeader eyebrow="RECURSOS DE CAMPAÑA" title="Recursos" description="Inventario y disponibilidad logística" isDemo={isDemo} />{!workspace ? <WorkspaceUnavailable title="Recursos" /> : <section className="resources-workspace campaign-workspace" data-campaign-module="recursos" data-demo-count={resources.length}><div className="campaign-tabs"><button className={filter === "todos" ? "active" : ""} onClick={() => setFilter("todos")}>Todos</button>{types.map((type) => <button key={type} className={filter === type ? "active" : ""} onClick={() => setFilter(type)}>{type}</button>)}</div><div className="preloaded-resource-grid">{visible.map((resource) => <article key={resource.id}><span>{resource.resource_type.toUpperCase()}</span><h3>{resource.name}</h3><b>{numberFormat.format(resource.quantity ?? 0)} <small>{resource.unit}</small></b><p>{resource.location} · {resource.notes}</p><em>{resource.status}</em>{canWrite ? <button onClick={() => void toggle(resource)}>Cambiar estado</button> : null}</article>)}</div></section>}</>;
}

export function CampaignPulse() {
  const { workspace, isDemo } = useWorkspace(); const snapshots = workspace?.pulse_snapshots ?? []; const [view, setView] = useState<"trend" | "history" | "method">("trend"); const maxValue = Math.max(1, ...snapshots.map((item) => Number(item.value)));
  const latest = [...snapshots].sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))[0];
  return <><CampaignSectionHeader eyebrow={`PULSO ELECTORAL${isDemo ? " · SIMULACIÓN" : ""}`} title="Pulso Electoral" description={isDemo ? "Serie sintética para demostración; no representa una medición real" : "Seguimiento autorizado de opinión y tendencia"} isDemo={isDemo} />{!workspace ? <WorkspaceUnavailable title="Pulso Electoral" /> : <section className="pulse-workspace campaign-workspace" data-campaign-module="pulso" data-demo-count={snapshots.length}><div className="pulse-disclaimer"><b>{isDemo ? "SIMULACIÓN" : "SESIÓN AUTORIZADA"}</b><span>{snapshots.length} mediciones; fuente y universo separados de resultados oficiales.</span></div><div className="campaign-tabs"><button className={view === "trend" ? "active" : ""} onClick={() => setView("trend")}>Tendencia</button><button className={view === "history" ? "active" : ""} onClick={() => setView("history")}>Histórico</button><button className={view === "method" ? "active" : ""} onClick={() => setView("method")}>Metodología</button></div>{view === "trend" ? <><div className="pulse-overview"><article><small>Último corte</small><b>{latest ? `${numberFormat.format(latest.value)}%` : "—"}</b><span>{latest?.label}</span></article><article><small>Serie</small><b>{snapshots.length}</b><span>puntos registrados</span></article></div><div className="pulse-trend-chart">{snapshots.map((snapshot) => <article key={snapshot.id}><div><i style={{ height: `${Number(snapshot.value) / maxValue * 100}%` }} /></div><b>{numberFormat.format(snapshot.value)}%</b><span>{snapshot.label}</span><small>{snapshot.snapshot_date.slice(0, 7)}</small></article>)}</div></> : view === "history" ? <div className="pulse-history">{snapshots.map((snapshot) => <article key={snapshot.id}><time>{snapshot.snapshot_date}</time><b>{snapshot.label}</b><strong>{numberFormat.format(snapshot.value)}%</strong><span>{snapshot.series}</span></article>)}</div> : <article className="pulse-method"><small>METODOLOGÍA</small><h3>Entorno de simulación</h3><p>Los datos de Valle Nexo son sintéticos, no representan encuestas ni resultados reales y sirven únicamente para validar flujos, gráficos y lectura estratégica.</p></article>}</section>}</>;
}

export function RadarAIModule() {
  const { consumer } = useMunicipalityContext(); const { workspace, isDemo } = useWorkspace(); const [prompt, setPrompt] = useState(""); const [answer, setAnswer] = useState("");
  function run(value = prompt) { const clean = value.trim(); if (!clean) return; if (!workspace) { setAnswer("La sesión no contiene Campaign Vault para producir una lectura operativa."); return; } setAnswer(`Lectura RADAR para ${consumer.municipality.name}: ${workspace.activities.length} actividades, ${workspace.contacts.length} contactos, ${workspace.fiscales.length} fiscales, ${workspace.incidents.filter((item) => item.status === "open").length} incidencias abiertas y ${workspace.rtd_results.length} actas RTD. ${isDemo ? "Resultado sintético de demostración." : "Resultado limitado al contexto autorizado."}`); setPrompt(clean); }
  return <><CampaignSectionHeader eyebrow="IA RADAR" title="IA RADAR" description="Asistente contextual del municipio y la campaña" isDemo={isDemo} /><section className="radar-ai-page campaign-workspace" data-campaign-module="ia-radar"><div className="radar-ai-boundary"><b>{isDemo ? "DEMO · SIMULACIÓN" : "CONTEXTO AUTORIZADO"}</b><span>La respuesta utiliza únicamente los datos cargados en esta sesión.</span></div><div className="radar-ai-starters">{["Resumir territorio", "Preparar agenda", "Revisar Día D"].map((item) => <button key={item} onClick={() => { setPrompt(item); run(item); }}>{item}</button>)}</div><div className="radar-ai-workbench"><label className="radar-ai-prompt"><span>Pregunta o tarea</span><textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Pedí una lectura operativa…" /></label><button className="primary" onClick={() => run()}>Generar lectura</button>{answer ? <article className="radar-ai-result"><small>RESPUESTA CONTEXTUAL</small><p>{answer}</p></article> : null}</div></section></>;
}

export function CampaignConfiguration() {
  const { consumer, campaign_id, refresh } = useMunicipalityContext(); const { workspace, isDemo } = useWorkspace(); const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle"); const canReset = isDemo && consumer.context.permissions.includes("demo_vault:reset");
  async function reset() { if (!supabase || !canReset || !window.confirm("¿Restablecer todos los datos editables de Valle Nexo a su estado demo original?")) return; setState("running"); const { error } = await supabase.rpc("reset_demo_campaign", { target_campaign: campaign_id }); if (error) { setState("error"); return; } await refresh(); setState("done"); }
  return <><CampaignSectionHeader eyebrow="CONFIGURACIÓN" title="Configuración" description="Contexto, permisos y controles de la campaña" isDemo={isDemo} /><section className="configuration-center campaign-workspace" data-campaign-module="configuracion"><div className="config-overview"><article><small>Municipio</small><b>{consumer.municipality.name}</b><span>{consumer.context.country_code} · {consumer.municipality.code}</span></article><article><small>Campaña</small><b>{consumer.campaign_name}</b><span>{campaign_id}</span></article><article><small>Rol</small><b>{consumer.context.user_role}</b><span>{consumer.context.permissions.length} permisos</span></article><article><small>Origen</small><b>{isDemo ? "Data Vault sintético + Demo Vault" : "Data Vault + Campaign Vault"}</b><span>RLS activo</span></article></div><section className="config-essential-grid"><article><small>CAPACIDADES ACTIVAS</small><h3>Navegación V70</h3><p>Inicio, Inteligencia, Estrategia, Directorio, Agenda, Mapa, Día D, Recursos, Pulso, IA y Configuración.</p></article><article><small>DATOS CARGADOS</small><h3>{workspace ? "Workspace operativo" : "Sin Campaign Vault"}</h3><p>{workspace ? `${workspace.contacts.length} contactos · ${workspace.activities.length} actividades · ${workspace.rtd_results.length} RTD` : "El componente espera datos autorizados."}</p></article></section>{isDemo ? <section className="config-reset-console"><small>DEMO VAULT</small><h2>Restablecer Demo</h2><p>El RPC restaura únicamente registros editables de esta campaña demo. Data Vault y Campaign Vault real quedan fuera.</p><button className="primary" disabled={!canReset || state === "running"} onClick={() => void reset()}>{state === "running" ? "Restableciendo…" : "Restablecer Demo"}</button>{state === "done" ? <MutationMessage value="Demo restaurada y consultas actualizadas." /> : state === "error" ? <MutationMessage value="No fue posible restablecer la demo." /> : null}</section> : null}</section></>;
}
