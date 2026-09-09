import { useState, type FormEvent } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import {
  deleteDemoActivity,
  deleteDemoContact,
  saveDemoActivity,
  saveDemoContact,
  type ActivityDraft,
  type ContactDraft,
} from "../data/demoVault";
import { supabase } from "../lib/supabase";
import type { DemoActivity, DemoContact } from "../types/radar";

const numberFormat = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Guatemala" });

function DemoSectionHeader({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) {
  return <section className="section-banner">
    <div className="section-banner-copy"><p>{eyebrow}</p><h1>{title}</h1><span>{description}</span></div>
    <div className="section-banner-actions"><span className="demo-badge">DEMO · SINTÉTICO</span></div>
  </section>;
}

function MutationMessage({ value }: { value: string }) {
  return value ? <p className="demo-mutation-message" role="status">{value}</p> : null;
}

function formatDate(value: string | null) {
  if (!value) return "Fecha por definir";
  return dateFormat.format(new Date(value));
}

export function DemoStrategy() {
  const { consumer } = useMunicipalityContext();
  const items = consumer.demo?.strategy_items ?? [];
  return <>
    <DemoSectionHeader eyebrow="ESTRATEGIA DE CAMPAÑA" title="Estrategia" description="Metas, hitos y escenarios de la campaña demo" />
    <section className="demo-section" data-demo-section="estrategia" data-demo-count={items.length}>
      <header className="demo-section-heading"><div><small>RUTA ESTRATÉGICA</small><h2>Prioridades activas</h2></div><b>{items.length} elementos</b></header>
      <div className="demo-strategy-grid">{items.map((item) => {
        const target = Number(item.target_value ?? 0);
        const current = Number(item.current_value ?? 0);
        const progress = target > 0 ? Math.min(100, current / target * 100) : 0;
        return <article key={item.id}>
          <div><span>{item.item_type.toUpperCase()}</span><em>{item.status}</em></div>
          <h3>{item.title}</h3><p>{item.description}</p>
          <div className="demo-progress"><i style={{ width: `${progress}%` }} /></div>
          <footer><b>{numberFormat.format(current)} / {numberFormat.format(target)}</b><small>{item.due_date ?? "Sin fecha"}</small></footer>
        </article>;
      })}</div>
    </section>
  </>;
}

const emptyContact: ContactDraft = { full_name: "", phone: "", community: "", address_text: "", status: "base", notes: "" };

function ContactEditor({ initial, onDone }: { initial: DemoContact | null; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext();
  const [draft, setDraft] = useState<ContactDraft>(initial ? {
    full_name: initial.full_name, phone: initial.phone ?? "", community: initial.community ?? "",
    address_text: initial.address_text ?? "", status: initial.status, notes: initial.notes ?? "",
  } : emptyContact);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { await saveDemoContact(campaign_id, initial?.id ?? null, draft); await onDone(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar el contacto."); }
    finally { setBusy(false); }
  }

  return <form className="demo-editor" onSubmit={(event) => void submit(event)}>
    <label><span>Nombre</span><input required value={draft.full_name} onChange={(event) => setDraft({ ...draft, full_name: event.target.value })} /></label>
    <label><span>Teléfono</span><input value={draft.phone ?? ""} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} /></label>
    <label><span>Comunidad</span><input value={draft.community ?? ""} onChange={(event) => setDraft({ ...draft, community: event.target.value })} /></label>
    <label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="base">Base</option><option value="contactado">Contactado</option><option value="seguimiento">Seguimiento</option></select></label>
    <label className="wide"><span>Dirección</span><input value={draft.address_text ?? ""} onChange={(event) => setDraft({ ...draft, address_text: event.target.value })} /></label>
    <label className="wide"><span>Notas</span><textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <footer><button type="button" onClick={() => void onDone()}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar contacto"}</button></footer>
    <MutationMessage value={message} />
  </form>;
}

export function DemoDirectory() {
  const { consumer, campaign_id, refresh } = useMunicipalityContext();
  const contacts = consumer.demo?.contacts ?? [];
  const canWrite = consumer.context.permissions.includes("demo_vault:write");
  const [editing, setEditing] = useState<DemoContact | null | undefined>(undefined);
  const [message, setMessage] = useState("");

  async function closeEditor() { setEditing(undefined); await refresh(); }
  async function remove(contact: DemoContact) {
    if (!window.confirm(`¿Eliminar a ${contact.full_name} de la demo?`)) return;
    setMessage("");
    try { await deleteDemoContact(campaign_id, contact.id); await refresh(); setMessage("Contacto eliminado de la demo."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible eliminar el contacto."); }
  }

  return <>
    <DemoSectionHeader eyebrow="DIRECTORIO TERRITORIAL" title="Directorio" description="Contactos demo aislados por campaña" />
    <section className="demo-section" data-demo-section="directorio" data-demo-count={contacts.length}>
      <header className="demo-section-heading"><div><small>CRM TERRITORIAL</small><h2>{contacts.length} contactos</h2></div>{canWrite ? <button className="primary" type="button" onClick={() => setEditing(null)}>+ Nuevo contacto</button> : null}</header>
      {editing !== undefined ? <ContactEditor key={editing?.id ?? "new"} initial={editing} onDone={closeEditor} /> : null}
      <MutationMessage value={message} />
      <div className="demo-directory-grid">{contacts.map((contact) => <article key={contact.id}>
        <div className="demo-avatar">{contact.full_name.split(/\s+/).map((part) => part[0]).slice(0, 2).join("")}</div>
        <div><small>{contact.community ?? "Comunidad por definir"}</small><h3>{contact.full_name}</h3><p>{contact.phone ?? "Sin teléfono"}</p><span>{contact.notes}</span></div>
        <em>{contact.status}</em>
        {canWrite ? <footer><button type="button" onClick={() => setEditing(contact)}>Editar</button><button type="button" onClick={() => void remove(contact)}>Eliminar</button></footer> : null}
      </article>)}</div>
    </section>
  </>;
}

const emptyActivity: ActivityDraft = { title: "", activity_type: "reunion", starts_at: "", community: "", latitude: null, longitude: null, status: "planned", notes: "" };

function ActivityEditor({ initial, onDone }: { initial: DemoActivity | null; onDone: () => Promise<void> }) {
  const { campaign_id } = useMunicipalityContext();
  const [draft, setDraft] = useState<ActivityDraft>(initial ? {
    title: initial.title, activity_type: initial.activity_type ?? "reunion",
    starts_at: initial.starts_at?.slice(0, 16) ?? "", community: initial.community ?? "",
    latitude: initial.latitude, longitude: initial.longitude, status: initial.status, notes: initial.notes ?? "",
  } : emptyActivity);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    const startsAt = draft.starts_at ? new Date(draft.starts_at).toISOString() : null;
    try { await saveDemoActivity(campaign_id, initial?.id ?? null, { ...draft, starts_at: startsAt }); await onDone(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible guardar la actividad."); }
    finally { setBusy(false); }
  }

  return <form className="demo-editor" onSubmit={(event) => void submit(event)}>
    <label className="wide"><span>Actividad</span><input required value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
    <label><span>Tipo</span><select value={draft.activity_type ?? "reunion"} onChange={(event) => setDraft({ ...draft, activity_type: event.target.value })}><option value="reunion">Reunión</option><option value="recorrido">Recorrido</option><option value="evento">Evento</option><option value="territorio">Territorio</option><option value="mesa_tecnica">Mesa técnica</option></select></label>
    <label><span>Fecha y hora</span><input type="datetime-local" value={draft.starts_at ?? ""} onChange={(event) => setDraft({ ...draft, starts_at: event.target.value })} /></label>
    <label><span>Comunidad</span><input value={draft.community ?? ""} onChange={(event) => setDraft({ ...draft, community: event.target.value })} /></label>
    <label><span>Estado</span><select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}><option value="planned">Planificada</option><option value="confirmada">Confirmada</option><option value="completada">Completada</option></select></label>
    <label className="wide"><span>Notas</span><textarea value={draft.notes ?? ""} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
    <footer><button type="button" onClick={() => void onDone()}>Cancelar</button><button className="primary" disabled={busy}>{busy ? "Guardando…" : "Guardar actividad"}</button></footer>
    <MutationMessage value={message} />
  </form>;
}

export function DemoAgenda() {
  const { consumer, campaign_id, refresh } = useMunicipalityContext();
  const activities = consumer.demo?.activities ?? [];
  const canWrite = consumer.context.permissions.includes("demo_vault:write");
  const [editing, setEditing] = useState<DemoActivity | null | undefined>(undefined);
  const [message, setMessage] = useState("");

  async function closeEditor() { setEditing(undefined); await refresh(); }
  async function remove(activity: DemoActivity) {
    if (!window.confirm(`¿Eliminar “${activity.title}” de la demo?`)) return;
    setMessage("");
    try { await deleteDemoActivity(campaign_id, activity.id); await refresh(); setMessage("Actividad eliminada de la demo."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No fue posible eliminar la actividad."); }
  }

  return <>
    <DemoSectionHeader eyebrow="OPERACIÓN TERRITORIAL" title="Agenda" description="Actividades demo sincronizadas con Supabase" />
    <section className="demo-section" data-demo-section="agenda" data-demo-count={activities.length}>
      <header className="demo-section-heading"><div><small>PRÓXIMAS ACTIVIDADES</small><h2>{activities.length} actividades</h2></div>{canWrite ? <button className="primary" type="button" onClick={() => setEditing(null)}>+ Nueva actividad</button> : null}</header>
      {editing !== undefined ? <ActivityEditor key={editing?.id ?? "new"} initial={editing} onDone={closeEditor} /> : null}
      <MutationMessage value={message} />
      <div className="demo-agenda-list">{activities.map((activity) => <article key={activity.id}>
        <time>{formatDate(activity.starts_at)}</time><div><small>{activity.activity_type?.replaceAll("_", " ")}</small><h3>{activity.title}</h3><p>{activity.community} · {activity.notes}</p></div><em>{activity.status}</em>
        {canWrite ? <footer><button type="button" onClick={() => setEditing(activity)}>Editar</button><button type="button" onClick={() => void remove(activity)}>Eliminar</button></footer> : null}
      </article>)}</div>
    </section>
  </>;
}

export function DemoDayD() {
  const { consumer } = useMunicipalityContext();
  const demo = consumer.demo;
  const fiscales = demo?.fiscales ?? [];
  const incidents = demo?.incidents ?? [];
  const results = demo?.rtd_results ?? [];
  return <>
    <DemoSectionHeader eyebrow="OPERACIÓN ELECTORAL" title="Día D" description="Fiscales, incidencias y RTD de simulación" />
    <section className="demo-section" data-demo-section="dia-d" data-fiscales-count={fiscales.length} data-rtd-count={results.length}>
      <div className="demo-kpis"><article><small>Fiscales asignados</small><b>{fiscales.length}</b></article><article><small>Incidencias</small><b>{incidents.length}</b></article><article><small>Actas RTD</small><b>{results.length}</b></article></div>
      <div className="demo-day-grid">
        <section><header><small>RED DE FISCALES</small><h2>{fiscales.length} asignaciones</h2></header><div className="demo-table">{fiscales.map((fiscal) => <article key={fiscal.id}><b>{fiscal.full_name}</b><span>{fiscal.voting_center_code} · {fiscal.jrv_code}</span><em>{fiscal.status}</em></article>)}</div></section>
        <section><header><small>INCIDENCIAS</small><h2>Seguimiento</h2></header><div className="demo-incidents">{incidents.map((incident) => <article key={incident.id}><div><b>{incident.incident_type}</b><em>{incident.severity}</em></div><p>{incident.description}</p><small>{incident.voting_center_code} · {incident.jrv_code} · {incident.status}</small></article>)}</div></section>
      </div>
      <section className="demo-rtd"><header><small>RECEPCIÓN Y TRANSMISIÓN DE DATOS</small><h2>{results.length} actas/resultados</h2></header><div className="demo-rtd-grid">{results.map((result) => <article key={result.id}><span>{result.election_type.replaceAll("_", " ")}</span><h3>{result.voting_center_code} · {result.jrv_code}</h3><b>{numberFormat.format(result.total_ballots ?? 0)} votos</b><p>{Object.entries(result.results).map(([label, value]) => `${label}: ${value}`).join(" · ")}</p><em>{result.status}</em></article>)}</div></section>
    </section>
  </>;
}

export function DemoResources() {
  const { consumer } = useMunicipalityContext();
  const resources = consumer.demo?.resources ?? [];
  return <>
    <DemoSectionHeader eyebrow="RECURSOS DE CAMPAÑA" title="Recursos" description="Inventario operativo de la campaña demo" />
    <section className="demo-section" data-demo-section="recursos" data-demo-count={resources.length}>
      <div className="demo-resource-grid">{resources.map((resource) => <article key={resource.id}><span>{resource.resource_type.toUpperCase()}</span><h3>{resource.name}</h3><b>{numberFormat.format(resource.quantity ?? 0)} <small>{resource.unit}</small></b><p>{resource.location}</p><em>{resource.status}</em></article>)}</div>
    </section>
  </>;
}

export function DemoPulse() {
  const { consumer } = useMunicipalityContext();
  const snapshots = consumer.demo?.pulse_snapshots ?? [];
  const maxValue = Math.max(1, ...snapshots.map((item) => Number(item.value)));
  return <>
    <DemoSectionHeader eyebrow="PULSO ELECTORAL · SIMULACIÓN" title="Pulso Electoral" description="Serie sintética para demostración; no representa una medición real" />
    <section className="demo-section" data-demo-section="pulso" data-demo-count={snapshots.length}>
      <div className="demo-simulation-notice"><b>SIMULACIÓN</b><span>Los {snapshots.length} puntos siguientes son datos sintéticos de entrenamiento y demostración.</span></div>
      <div className="demo-pulse-chart" aria-label="Serie de intención electoral simulada">{snapshots.map((snapshot) => <article key={snapshot.id} title={`${snapshot.label}: ${snapshot.value}%`}>
        <div><i style={{ height: `${Number(snapshot.value) / maxValue * 100}%` }} /></div><b>{numberFormat.format(snapshot.value)}%</b><span>{snapshot.label}</span><small>{snapshot.snapshot_date.slice(0, 7)}</small>
      </article>)}</div>
    </section>
  </>;
}

export function DemoConfiguration() {
  const { consumer, campaign_id, refresh } = useMunicipalityContext();
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const canReset = consumer.context.permissions.includes("demo_vault:reset");

  async function reset() {
    if (!supabase || !canReset || !window.confirm("¿Restablecer todos los datos editables de Valle Nexo a su estado demo original?")) return;
    setState("running");
    const { error } = await supabase.rpc("reset_demo_campaign", { target_campaign: campaign_id });
    if (error) { setState("error"); return; }
    await refresh(); setState("done");
  }

  return <>
    <DemoSectionHeader eyebrow="CONFIGURACIÓN · DEMO" title="Configuración" description="Control seguro del entorno sintético Valle Nexo" />
    <section className="demo-section demo-configuration" data-demo-section="configuracion">
      <small>DEMO VAULT</small><h2>Restablecer Demo</h2><p>El RPC elimina y restaura únicamente los registros editables de esta campaña demo. Data Vault y Campaign Vault real quedan fuera de la operación.</p>
      <dl><div><dt>Campaña</dt><dd>{consumer.campaign_name}</dd></div><div><dt>Permiso</dt><dd>{canReset ? "demo_vault:reset" : "Sin permiso"}</dd></div></dl>
      <button className="primary" type="button" disabled={!canReset || state === "running"} onClick={() => void reset()}>{state === "running" ? "Restableciendo…" : "Restablecer Demo"}</button>
      {state === "done" ? <MutationMessage value="Demo restaurada y consultas actualizadas." /> : state === "error" ? <MutationMessage value="No fue posible restablecer la demo." /> : null}
    </section>
  </>;
}
