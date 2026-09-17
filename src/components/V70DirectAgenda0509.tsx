import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  deleteCampaignActivity,
  deleteCampaignVaultFile,
  downloadCampaignVaultFile,
  loadAuthorizedVoterSuggestions,
  loadCampaignBundle,
  loadCampaignContacts,
  loadCampaignRecords,
  saveCampaignRecord,
  deleteCampaignRecord,
  saveCampaignActivity,
  uploadCampaignVaultFile,
  type AuthorizedVoterSuggestion,
  type CampaignActivityRecord,
  type CampaignCommitmentRecord,
  type CampaignContactRecord,
  type CampaignIdentityRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import { getInstalledRadarVoterCommunities } from "../data/radarRuntimeCache";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { downloadActivityPng, V70RouteSnapshot } from "./V70ActivityVisual";
import { V70LocationPicker, type V70RoutePoint } from "./V70LocationPicker";

const electoralMilestones = [
  ["convocatoria", "22 ENE 2027", "Convocatoria a elecciones", "CANDIDATURA"],
  [
    "postulacion",
    "23 ENE–28 MAR",
    "Postulación e inscripción de candidatos",
    "CANDIDATURA",
  ],
  [
    "ciudadanos",
    "20 MAR 2027",
    "Cierre de inscripción de ciudadanos",
    "OPERACIÓN",
  ],
  [
    "campana-inicio",
    "29 MAR 2027",
    "Inicio del período de campaña electoral",
    "CAMPAÑA",
  ],
  ["padron", "24–30 ABR", "Publicación del padrón electoral", "OPERACIÓN"],
  [
    "jrv-municipio",
    "28 ABR 2027",
    "Definición del número de JRV por municipio",
    "OPERACIÓN",
  ],
  ["financiamiento", "28 MAY 2027", "Publicidad del financiamiento", "CAMPAÑA"],
  [
    "campana-cierre",
    "25 JUN · 12:00",
    "Cierre de campaña, propaganda y publicación de encuestas",
    "CAMPAÑA",
  ],
  ["eleccion", "27 JUN 2027", "Elecciones generales", "OPERACIÓN"],
  [
    "revision",
    "28 JUN–2 JUL",
    "Audiencias de revisión de escrutinios",
    "CANDIDATURA",
  ],
] as const;
const activityTypes = [
  "VISITA",
  "REUNION",
  "MITIN",
  "CAMINATA",
  "EVENTO",
  "RECORRIDO",
  "CAPACITACION",
  "OTRA",
] as const;
const activityTypeLabels: Record<string, string> = {
  VISITA: "Visita",
  REUNION: "Reunión",
  MITIN: "Mitin",
  CAMINATA: "Caminata / caravana",
  EVENTO: "Evento",
  RECORRIDO: "Recorrido",
  CAPACITACION: "Capacitación",
  OTRA: "Otra",
};
const emptyActivity = {
  title: "",
  item_kind: "ACTIVIDAD",
  category: "",
  activity_type: "REUNION",
  starts_at: "",
  deadline: "",
  community: "",
  responsible_person_id: "",
  participant_ids: [] as string[],
  elector_ids: [] as number[],
  manual_participants: "",
  notes: "",
  status: "PLANIFICADA",
  place_source: "FREE",
  route_points: [] as V70RoutePoint[],
  route_color: "#09566C",
  checklist_template: "",
  latitude: null as number | null,
  longitude: null as number | null,
};
function initialActivity() {
  const params = new URLSearchParams(window.location.search);
  const latitudeParam = params.get("lat");
  const longitudeParam = params.get("lon");
  const electorId = Number(params.get("elector"));
  const latitude = latitudeParam === null ? Number.NaN : Number(latitudeParam);
  const longitude = longitudeParam === null ? Number.NaN : Number(longitudeParam);
  return {
    ...emptyActivity,
    community: params.get("community") ?? "",
    responsible_person_id: params.get("responsiblePersonId") ?? "",
    elector_ids: Number.isFinite(electorId) ? [electorId] : [],
    latitude: Number.isFinite(latitude) ? latitude : null,
    longitude: Number.isFinite(longitude) ? longitude : null,
  };
}

function monthCells(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(
    month.getFullYear(),
    month.getMonth() + 1,
    0,
  ).getDate();
  const pad = (first.getDay() + 6) % 7;
  return [
    ...Array<null>(pad).fill(null),
    ...Array.from({ length: count }, (_, index) => index + 1),
  ];
}
function displayActivityDate(value: string | null) {
  if (!value) return "Sin fecha";
  return new Intl.DateTimeFormat("es-GT", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function AgendaContent() {
  const { campaign_id, municipality_code } = useMunicipalityContext();
  const communities =
    getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const [view, setView] = useState<"calendar" | "list">("calendar");
  const [month, setMonth] = useState(() => new Date());
  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [people, setPeople] = useState<CampaignContactRecord[]>([]);
  const [identity, setIdentity] = useState<CampaignIdentityRecord>({});
  const [commitments, setCommitments] = useState<CampaignCommitmentRecord[]>(
    [],
  );
  const [open, setOpen] = useState(
    () => new URLSearchParams(window.location.search).get("new") === "1",
  );
  const [picker, setPicker] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(initialActivity);
  const [teamQuery, setTeamQuery] = useState("");
  const [electorQuery, setElectorQuery] = useState("");
  const [electorResults, setElectorResults] = useState<AuthorizedVoterSuggestion[]>([]);
  const [selectedElectors, setSelectedElectors] = useState<AuthorizedVoterSuggestion[]>(() => {
    const params = new URLSearchParams(window.location.search);
    const id = Number(params.get("elector"));
    const fullName = params.get("electorName");
    return Number.isFinite(id) && fullName
      ? [{ id, full_name: fullName, community: params.get("community"), estimated_age_2026: null }]
      : [];
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [commitmentRecords, setCommitmentRecords] = useState<CampaignModuleRecord[]>([]);
  const [commitmentOpen, setCommitmentOpen] = useState(false);
  const [commitmentEditingId, setCommitmentEditingId] = useState<string | null>(null);
  const [commitmentFile, setCommitmentFile] = useState<File | null>(null);
  const [commitmentForm, setCommitmentForm] = useState({ title: "", responsible: "", due_date: "", priority: "MEDIA", status: "PENDIENTE", beneficiary: "", origin_activity_id: "", notes: "" });
  const days = useMemo(() => monthCells(month), [month]);
  const now = new Date();

  useEffect(() => {
    let cancelled = false;
    if (!campaign_id) return;
    void ensureRadarAccessToken()
      .then(async (token) => ({
        bundle: await loadCampaignBundle(campaign_id, token),
        people: await loadCampaignContacts(campaign_id, token),
      }))
      .then(({ bundle, people: loadedPeople }) => {
        if (cancelled) return;
        setActivities(bundle.activities);
        setCommitments(bundle.commitments);
        setIdentity(bundle.identity ?? {});
        setPeople(loadedPeople ?? []);
        const requested = new URLSearchParams(window.location.search).get("activity");
        const target = requested ? bundle.activities.find((item) => item.id === requested) : null;
        if (target) editActivity(target);
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setMessage(
            error instanceof Error
              ? error.message
              : "No se pudo cargar la agenda.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [campaign_id]);

  useEffect(() => {
    let cancelled = false; if (!campaign_id) return;
    void ensureRadarAccessToken().then((token) => loadCampaignRecords(campaign_id, "agenda", token)).then((records) => { if (!cancelled) setCommitmentRecords((records ?? []).filter((item) => item.category === "COMPROMISO")); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [campaign_id]);

  useEffect(() => {
    let cancelled = false;
    if (electorQuery.trim().length < 2) {
      setElectorResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void ensureRadarAccessToken()
        .then((token) =>
          loadAuthorizedVoterSuggestions(
            municipality_code,
            electorQuery,
            token,
          ),
        )
        .then((rows) => {
          if (!cancelled) setElectorResults(rows);
        })
        .catch(() => {
          if (!cancelled) setElectorResults([]);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [electorQuery, municipality_code]);

  const selectedTeam = useMemo(
    () =>
      form.participant_ids
        .map((id) => people.find((person) => person.id === id))
        .filter((person): person is CampaignContactRecord => Boolean(person)),
    [form.participant_ids, people],
  );
  const teamResults = useMemo(() => {
    const term = teamQuery.trim().toLocaleLowerCase("es");
    if (term.length < 2) return [];
    return people
      .filter((person) => !form.participant_ids.includes(person.id))
      .filter((person) =>
        `${person.full_name} ${person.role ?? ""} ${person.community ?? ""}`
          .toLocaleLowerCase("es")
          .includes(term),
      )
      .slice(0, 8);
  }, [form.participant_ids, people, teamQuery]);

  const upcoming = useMemo(
    () =>
      activities
        .filter(
          (activity) =>
            activity.starts_at &&
            new Date(activity.starts_at).getTime() >= Date.now(),
        )
        .sort(
          (a, b) =>
            new Date(a.starts_at ?? 0).getTime() -
            new Date(b.starts_at ?? 0).getTime(),
        ),
    [activities],
  );
  const monthActivities = useMemo(
    () =>
      activities.filter((activity) => {
        if (!activity.starts_at) return false;
        const date = new Date(activity.starts_at);
        return (
          date.getMonth() === month.getMonth() &&
          date.getFullYear() === month.getFullYear()
        );
      }),
    [activities, month],
  );
  const openCommitments = commitments.filter(
    (item) => item.status !== "cumplido",
  );
  const overdueCommitments = openCommitments.filter(
    (item) =>
      item.due_date &&
      new Date(`${item.due_date}T23:59:59`).getTime() < Date.now(),
  );
  const formPreview: CampaignActivityRecord = {
    id: editing ?? "preview",
    campaign_id,
    title: form.title || "Nueva caminata",
    activity_type: form.activity_type,
    starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
    community: form.community || null,
    latitude: form.latitude,
    longitude: form.longitude,
    status: form.status,
    notes: form.notes || null,
    details: { route_points: form.route_points, route_color: form.route_color, responsible: people.find((person) => person.id === form.responsible_person_id)?.full_name || "", participants: selectedTeam, electors: selectedElectors, manual_participants: form.manual_participants },
    created_at: "",
    updated_at: "",
  };

  async function createActivity(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const startsAt = form.starts_at
        ? new Date(form.starts_at).toISOString()
        : null;
      const responsible = people.find(
        (person) => person.id === form.responsible_person_id,
      );
      const saved = await saveCampaignActivity(
        campaign_id,
        {
          title: form.title,
          activity_type: form.activity_type,
          starts_at: startsAt,
          community: form.community,
          latitude: form.latitude,
          longitude: form.longitude,
          status: form.status,
          notes: form.notes,
          details: {
            item_kind: form.item_kind,
            category: form.category,
            deadline: form.deadline,
            responsible_person_id: form.responsible_person_id,
            responsible: responsible?.full_name ?? "",
            participant_ids: form.participant_ids,
            elector_ids: form.elector_ids,
            electors: selectedElectors,
            manual_participants: form.manual_participants,
            place_source: form.place_source,
            route_points: form.route_points,
            route_color: form.route_color,
            checklist_template: form.checklist_template,
          },
        },
        token,
        editing,
      );
      setActivities((current) =>
        editing
          ? current.map((item) => (item.id === editing ? saved : item))
          : [...current, saved],
      );
      setForm(emptyActivity);
      setEditing(null);
      setSelectedElectors([]);
      setOpen(false);
      setMessage(
        editing
          ? "Actividad actualizada en Agenda y Mapa."
          : "Actividad guardada y enviada al Mapa Inteligente.",
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la actividad.",
      );
    } finally {
      setSaving(false);
    }
  }

  function newActivity() {
    setEditing(null);
    setForm(emptyActivity);
    setSelectedElectors([]);
    setTeamQuery("");
    setElectorQuery("");
    setMessage("");
    setOpen(true);
  }

  function editActivity(activity: CampaignActivityRecord) {
    const details = activity.details ?? {};
    const detailText = (key: string) =>
      typeof details[key] === "string" ? String(details[key]) : "";
    const detailStrings = (key: string) =>
      Array.isArray(details[key]) ? (details[key] as string[]) : [];
    const detailNumbers = (key: string) =>
      Array.isArray(details[key]) ? (details[key] as number[]) : [];
    const detailPoints = (key: string) =>
      Array.isArray(details[key]) ? (details[key] as V70RoutePoint[]) : [];
    setEditing(activity.id);
    setForm({
      title: activity.title,
      item_kind: detailText("item_kind") || "ACTIVIDAD",
      category: detailText("category"),
      activity_type: activity.activity_type || "REUNION",
      starts_at: activity.starts_at ? activity.starts_at.slice(0, 16) : "",
      deadline: detailText("deadline"),
      community: activity.community || "",
      responsible_person_id: detailText("responsible_person_id"),
      participant_ids: detailStrings("participant_ids"),
      elector_ids: detailNumbers("elector_ids"),
      manual_participants: detailText("manual_participants"),
      notes: activity.notes || "",
      status: activity.status,
      place_source: detailText("place_source") || "FREE",
      route_points: detailPoints("route_points"),
      route_color: detailText("route_color") || "#09566C",
      checklist_template: detailText("checklist_template"),
      latitude: activity.latitude,
      longitude: activity.longitude,
    });
    setSelectedElectors(
      Array.isArray(details.electors)
        ? (details.electors as AuthorizedVoterSuggestion[])
        : [],
    );
    setOpen(true);
  }

  async function removeActivity(activityId: string) {
    if (!campaign_id || !window.confirm("¿Eliminar esta actividad? Esta acción también la quitará del mapa.")) return;
    try {
      const token = await ensureRadarAccessToken();
      await deleteCampaignActivity(campaign_id, activityId, token);
      setActivities((current) => current.filter((item) => item.id !== activityId));
      setMessage("Actividad eliminada de Agenda y Mapa.");
      setOpen(false);
      setEditing(null);
    } catch (deleteError) {
      setMessage(deleteError instanceof Error ? deleteError.message : "No se pudo eliminar la actividad.");
    }
  }
  function printActivity(activity: CampaignActivityRecord) {
    void downloadActivityPng(activity, {
      campaignName: identity.candidate_name || "Campaña municipal",
      partyName: identity.party_name || "Partido político",
      partyLogoUrl: identity.party_logo_data_url || undefined,
      municipality: "San José / Puerto San José · Escuintla",
    }).catch((error: unknown) => setMessage(error instanceof Error ? error.message : "No se pudo generar el PNG."));
  }
  function openActivityMonth(activity: CampaignActivityRecord) {
    const date = new Date(activity.starts_at ?? Date.now());
    setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setView("calendar");
  }
  function activityWhatsApp(activity: CampaignActivityRecord) {
    const message = [activity.title, displayActivityDate(activity.starts_at), activity.community || "Ubicación por confirmar"].join(" · ");
    return `https://wa.me/?text=${encodeURIComponent(message)}`;
  }

  function addTeamParticipant(id: string) {
    if (form.participant_ids.includes(id)) return;
    setForm((current) => ({ ...current, participant_ids: [...current.participant_ids, id] }));
    setTeamQuery("");
  }

  function addElector(elector: AuthorizedVoterSuggestion) {
    if (form.elector_ids.includes(elector.id)) return;
    setSelectedElectors((current) => [...current, elector]);
    setForm((current) => ({ ...current, elector_ids: [...current.elector_ids, elector.id] }));
    setElectorQuery("");
    setElectorResults([]);
  }
  function openCommitment(record?: CampaignModuleRecord) {
    setCommitmentEditingId(record?.id ?? null);
    setCommitmentFile(null);
    setCommitmentForm(record ? {
      title: record.title,
      responsible: String(record.payload?.responsible_id || ""),
      due_date: String(record.payload?.due_date || ""),
      priority: String(record.payload?.priority || "MEDIA"),
      status: record.status,
      beneficiary: String(record.payload?.beneficiary || ""),
      origin_activity_id: String(record.payload?.origin_activity_id || ""),
      notes: record.details || "",
    } : { title: "", responsible: "", due_date: "", priority: "MEDIA", status: "PENDIENTE", beneficiary: "", origin_activity_id: "", notes: "" });
    setMessage("");
    setCommitmentOpen(true);
  }
  async function createCommitment(event: FormEvent) {
    event.preventDefault(); if (!campaign_id) return; setSaving(true); setMessage("");
    try { const token = await ensureRadarAccessToken(); const responsible = people.find((item) => item.id === commitmentForm.responsible); const current = commitmentEditingId ? commitmentRecords.find((record) => record.id === commitmentEditingId) : null; const storedFile = commitmentFile ? await uploadCampaignVaultFile(campaign_id, "agenda-compromisos", commitmentFile, token) : null; const saved = await saveCampaignRecord(campaign_id, { module_key: "agenda", category: "COMPROMISO", title: commitmentForm.title, details: commitmentForm.notes || null, status: commitmentForm.status, payload: { ...current?.payload, responsible_id: commitmentForm.responsible || null, responsible: responsible?.full_name || current?.payload?.responsible || null, due_date: commitmentForm.due_date || null, priority: commitmentForm.priority, beneficiary: commitmentForm.beneficiary || null, origin_activity_id: commitmentForm.origin_activity_id || null, file_name: storedFile?.file_name || current?.payload?.file_name || null, file_path: storedFile?.path || current?.payload?.file_path || null, file_size: storedFile?.file_size || current?.payload?.file_size || null, mime_type: storedFile?.mime_type || current?.payload?.mime_type || null } }, token, commitmentEditingId); setCommitmentRecords((rows) => [saved, ...rows.filter((item) => item.id !== saved.id)]); setCommitmentOpen(false); setCommitmentEditingId(null); setCommitmentFile(null); setCommitmentForm({ title: "", responsible: "", due_date: "", priority: "MEDIA", status: "PENDIENTE", beneficiary: "", origin_activity_id: "", notes: "" }); setMessage("Compromiso guardado y vinculado con Agenda."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el compromiso."); } finally { setSaving(false); }
  }
  async function removeCommitment(record: CampaignModuleRecord) {
    if (!campaign_id || !window.confirm(`¿Eliminar “${record.title}”?`)) return;
    try { const token = await ensureRadarAccessToken(); const filePath = typeof record.payload?.file_path === "string" ? record.payload.file_path : ""; if (filePath) await deleteCampaignVaultFile(filePath, token); await deleteCampaignRecord(campaign_id, record.id, token); setCommitmentRecords((rows) => rows.filter((item) => item.id !== record.id)); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo eliminar el compromiso."); }
  }
  async function downloadCommitmentFile(record: CampaignModuleRecord) {
    const filePath = typeof record.payload?.file_path === "string" ? record.payload.file_path : "";
    if (!filePath) return;
    try {
      const token = await ensureRadarAccessToken();
      const blob = await downloadCampaignVaultFile(filePath, token);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = String(record.payload?.file_name || "evidencia-compromiso");
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo descargar la evidencia."); }
  }

  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>OPERACIÓN</p>
          <h1>Agenda</h1>
          <span>Actividades, responsables, participantes y compromisos</span>
        </div>
        <div className="section-banner-actions">
          <button type="button" onClick={newActivity}>
            + Nueva actividad
          </button>
        </div>
      </section>
      {message ? (
        <p className="agenda-message" role="status">
          {message}
        </p>
      ) : null}
      <section className="agenda-next">
        {upcoming[0] ? (
          <article>
            <time>
              <b>{new Date(upcoming[0].starts_at ?? 0).getDate()}</b>
              <span>{new Date(upcoming[0].starts_at ?? 0).toLocaleDateString("es-GT", { month: "short" }).replace(".", "")}</span>
            </time>
            <div>
              <small>PRÓXIMA ACTIVIDAD EN LA AGENDA</small>
              <h2>{upcoming[0].title}</h2>
              <p>
                {displayActivityDate(upcoming[0].starts_at)}
                {upcoming[0].community ? ` · ${upcoming[0].community}` : ""}
              </p>
            </div>
            <button type="button" onClick={() => editActivity(upcoming[0])}>
              Abrir actividad
            </button>
          </article>
        ) : (
          <article className="empty">
            <time><b>—</b><span>PRÓXIMA</span></time>
            <div>
              <small>PRÓXIMA ACTIVIDAD EN LA AGENDA</small>
              <h2>No hay actividades programadas</h2>
              <p>Crea una actividad para verla destacada aquí.</p>
            </div>
            <button type="button" onClick={newActivity}>
              + Nueva actividad
            </button>
          </article>
        )}
      </section>
      <section className="agenda-viewbar">
        <div>
          <button
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            Calendario
          </button>
          <button
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            Lista
          </button>
        </div>
        <Link to={`/municipio/${municipality_code}/mapa`}>
          Ver actividades en el mapa →
        </Link>
      </section>
      <section className="agenda-workspace">
        <div className="agenda-calendar">
          <header>
            <div>
              <small>AGENDA COMPARTIDA</small>
              <h2>
                {view === "calendar"
                  ? month.toLocaleDateString("es-GT", {
                      month: "long",
                      year: "numeric",
                    })
                  : "Próximas actividades"}
              </h2>
            </div>
            {view === "calendar" ? (
              <nav>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() - 1, 1),
                    )
                  }
                >
                  ←
                </button>
                <button onClick={() => setMonth(new Date())}>Hoy</button>
                <button
                  onClick={() =>
                    setMonth(
                      new Date(month.getFullYear(), month.getMonth() + 1, 1),
                    )
                  }
                >
                  →
                </button>
              </nav>
            ) : null}
          </header>
          {view === "calendar" ? (
            <div className="month-grid">
              <div className="month-week">
                {["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"].map(
                  (label) => (
                    <span key={label}>{label}</span>
                  ),
                )}
              </div>
              <div className="month-days">
                {days.map((day, index) =>
                  day ? (
                    <article
                      className={
                        day === now.getDate() &&
                        month.getMonth() === now.getMonth() &&
                        month.getFullYear() === now.getFullYear()
                          ? "today"
                          : ""
                      }
                      key={day}
                    >
                      <b>{day}</b>
                      {monthActivities
                        .filter(
                          (activity) =>
                            new Date(activity.starts_at ?? 0).getDate() === day,
                        )
                        .slice(0, 2)
                        .map((activity) => (
                          <button key={activity.id} title={activity.title} onClick={() => editActivity(activity)}>
                            {activity.title}
                          </button>
                        ))}
                    </article>
                  ) : (
                    <article className="blank" key={`b${index}`} />
                  ),
                )}
              </div>
            </div>
          ) : upcoming.length ? (
            upcoming.map((activity) => (
              <article key={activity.id}>
                <time>
                  <b>{new Date(activity.starts_at ?? 0).getDate()}</b>
                  <span>
                    {new Date(activity.starts_at ?? 0).toLocaleDateString(
                      "es-GT",
                      { month: "short" },
                    )}
                  </span>
                </time>
                <i style={{ background: "#552676" }} />
                <div>
                  <small>{activity.activity_type || "ACTIVIDAD"}</small>
                  <h3>{activity.title}</h3>
                  <p>{activity.community || "Sin comunidad"}</p>
                </div>
                <em>{displayActivityDate(activity.starts_at)}</em>
                <div className="agenda-actions" aria-label={`Acciones de ${activity.title}`}>
                  <button className="agenda-print-action" type="button" onClick={() => printActivity(activity)}>Imprimir</button>
                  <button type="button" onClick={() => editActivity(activity)}>Editar</button>
                  <button type="button" onClick={() => openActivityMonth(activity)}>Calendario</button>
                  <button type="button" onClick={() => window.open(activityWhatsApp(activity), "_blank", "noopener,noreferrer")}>WhatsApp</button>
                  <button className="agenda-delete-action" type="button" onClick={() => void removeActivity(activity.id)}>Eliminar</button>
                </div>
              </article>
            ))
          ) : (
            <div className="agenda-empty">
              <b>No hay actividades próximas.</b>
              <span>
                Crea una actividad con responsable del Directorio y
                participantes opcionales.
              </span>
              <button onClick={newActivity}>Crear actividad</button>
            </div>
          )}
        </div>
        <aside>
          <small>CALENDARIO ELECTORAL</small>
          <h2>Guatemala 2027</h2>
          <p className="electoral-note">
            Fechas preliminares del TSE, sujetas al decreto oficial de
            convocatoria.
          </p>
          <div className="electoral-date-list">
            {electoralMilestones.map(([id, date, title, scope]) => (
              <article className="electoral-date" key={id}>
                <time>{date}</time>
                <b>{title}</b>
                <span>{scope} · PRELIMINAR</span>
              </article>
            ))}
          </div>
          <a
            href="https://tse.org.gt/comunicacion/noticias/tse-presenta-cronograma-electoral-preliminar-para-las-elecciones-generales-y-de-diputados-al-parlamento-centroamericano-2027"
            target="_blank"
            rel="noreferrer"
          >
            Consultar fuente oficial TSE ↗
          </a>
        </aside>
      </section>
      <section className="commitments-section">
        <header>
          <div>
            <small>SEGUIMIENTO DE ACUERDOS</small>
            <h2>Compromisos adquiridos</h2>
            <p>
              Cada compromiso tiene responsable, fecha límite, prioridad y
              evidencia de cumplimiento.
            </p>
          </div>
          <button type="button" onClick={() => openCommitment()}>
            + Nuevo compromiso
          </button>
        </header>
        <div className="commitment-kpis">
          <span>
            <b>{openCommitments.length + commitmentRecords.filter((item) => item.status !== "CUMPLIDO").length}</b> abiertos
          </span>
          <span>
            <b>{overdueCommitments.length}</b> vencidos
          </span>
          <span>
            <b>{commitments.length - openCommitments.length + commitmentRecords.filter((item) => item.status === "CUMPLIDO").length}</b> cumplidos
          </span>
        </div>
        <div className="commitment-list">
          {commitmentRecords.length ? commitmentRecords.map((record) => { const due = String(record.payload?.due_date || ""); const isLate = !["CUMPLIDO", "CANCELADO"].includes(record.status) && Boolean(due) && due < new Date().toISOString().slice(0, 10); return <article className={isLate ? "late" : ""} key={record.id}><div><small>{String(record.payload?.priority || "MEDIA")} · {isLate ? "VENCIDO" : record.status.replaceAll("_", " ")}</small><b>{record.title}</b><span>{String(record.payload?.beneficiary || "Sin beneficiario o grupo indicado")}</span></div><div><small>RESPONSABLE</small><b>{String(record.payload?.responsible || "Sin responsable")}</b></div><div><small>FECHA LÍMITE</small><b>{due ? new Date(`${due}T12:00:00`).toLocaleDateString("es-GT") : "Sin fecha"}</b></div><div className="commitment-actions">{record.payload?.file_path ? <button type="button" onClick={() => void downloadCommitmentFile(record)}>Archivo</button> : null}<button type="button" onClick={() => openCommitment(record)}>Editar</button><button className="record-delete-action" type="button" onClick={() => void removeCommitment(record)}>Eliminar</button></div></article>; }) : <div className="agenda-empty">
            <b>
              {commitments.length
                ? "Compromisos cargados en Campaign Vault."
                : "No hay compromisos registrados."}
            </b>
            <span>
              {commitments.length
                ? "El detalle se habilitará en el bloque de seguimiento."
                : "Créalos al terminar una reunión o directamente desde este panel."}
            </span>
          </div>}
        </div>
      </section>
      {commitmentOpen ? <div className="agenda-modal" role="dialog" aria-modal="true"><form onSubmit={createCommitment}><header><div><small>SEGUIMIENTO</small><h2>{commitmentEditingId ? "Modificar compromiso" : "Nuevo compromiso"}</h2></div><button type="button" onClick={() => setCommitmentOpen(false)}>×</button></header><div className="agenda-form-grid"><label className="wide"><span>Compromiso *</span><input autoFocus required value={commitmentForm.title} onChange={(event) => setCommitmentForm({ ...commitmentForm, title: event.target.value })} placeholder="Ej. Entregar propuesta de alumbrado comunitario" /></label><label><span>Responsable *</span><select required value={commitmentForm.responsible} onChange={(event) => setCommitmentForm({ ...commitmentForm, responsible: event.target.value })}><option value="">Seleccionar del Directorio…</option>{people.map((person) => <option key={person.id} value={person.id}>{person.full_name}</option>)}</select></label><label><span>Fecha límite *</span><input required type="date" value={commitmentForm.due_date} onChange={(event) => setCommitmentForm({ ...commitmentForm, due_date: event.target.value })} /></label><label><span>Prioridad</span><select value={commitmentForm.priority} onChange={(event) => setCommitmentForm({ ...commitmentForm, priority: event.target.value })}><option>ALTA</option><option>MEDIA</option><option>BAJA</option></select></label><label><span>Estado</span><select value={commitmentForm.status} onChange={(event) => setCommitmentForm({ ...commitmentForm, status: event.target.value })}><option>PENDIENTE</option><option>EN_PROGRESO</option><option>CUMPLIDO</option><option>CANCELADO</option></select></label><label className="wide"><span>Persona, comunidad o grupo beneficiario</span><input value={commitmentForm.beneficiary} onChange={(event) => setCommitmentForm({ ...commitmentForm, beneficiary: event.target.value })} /></label><label className="wide"><span>Actividad de origen (opcional)</span><select value={commitmentForm.origin_activity_id} onChange={(event) => setCommitmentForm({ ...commitmentForm, origin_activity_id: event.target.value })}><option value="">Compromiso independiente</option>{activities.map((activity) => <option value={activity.id} key={activity.id}>{activity.title}</option>)}</select></label><label className="wide"><span>Detalle y evidencia esperada</span><textarea rows={3} value={commitmentForm.notes} onChange={(event) => setCommitmentForm({ ...commitmentForm, notes: event.target.value })} /></label><label className="wide commitment-attachment"><span>Documento, archivo o fotografía (opcional)</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" onChange={(event) => { const next = event.target.files?.[0] || null; if (next && next.size > 10 * 1024 * 1024) { setMessage("La evidencia supera el máximo de 10 MB."); event.currentTarget.value = ""; setCommitmentFile(null); return; } setCommitmentFile(next); }} /><small>{commitmentFile?.name || (commitmentEditingId && commitmentRecords.find((record) => record.id === commitmentEditingId)?.payload?.file_name ? `Archivo actual: ${String(commitmentRecords.find((record) => record.id === commitmentEditingId)?.payload?.file_name)}` : "Puedes adjuntar evidencia al crear, modificar o cerrar el compromiso. Máximo 10 MB.")}</small></label></div><footer><button type="button" onClick={() => { setCommitmentOpen(false); setCommitmentFile(null); }}>Cancelar</button><button disabled={saving || !people.length}>{saving ? "Guardando…" : "Guardar compromiso"}</button></footer></form></div> : null}
      {open ? (
        <div
          className="agenda-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="new-activity-title"
        >
          <form onSubmit={createActivity}>
            <header>
              <div>
                <small>CAMPAIGN VAULT</small>
                <h2 id="new-activity-title">
                  {editing ? "Modificar elemento" : "Nuevo elemento de Agenda"}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <div className="agenda-form-grid">
              <label>
                <span>Clase *</span>
                <select value={form.item_kind} onChange={(event) => setForm({ ...form, item_kind: event.target.value })}>
                  {["ACTIVIDAD", "COMPROMISO", "TAREA"].map((item) => <option key={item}>{item}</option>)}
                </select>
              </label>
              <label>
                <span>Categoría</span>
                <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="Ej. Legal, territorial o logística" />
              </label>
              <label className="wide">
                <span>Actividad o tarea *</span>
                <input
                  autoFocus
                  required
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Ej. Reunión con líderes comunitarios"
                />
              </label>
              <label>
                <span>Tipo operativo *</span>
                <select
                  value={form.activity_type}
                  onChange={(event) => {
                    const type = event.target.value;
                    setForm({ ...form, activity_type: type, checklist_template: type === "MITIN" ? "MITIN_OPERATIVO" : type === "CAMINATA" ? "CAMINATA_TERRITORIAL" : "", route_points: type === "CAMINATA" ? form.route_points : [] });
                  }}
                >
                  {activityTypes.map((type) => (
                    <option key={type} value={type}>{activityTypeLabels[type]}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Fecha inicio *</span>
                <input
                  type="datetime-local"
                  required
                  value={form.starts_at}
                  onChange={(event) =>
                    setForm({ ...form, starts_at: event.target.value })
                  }
                />
              </label>
              <label><span>Fecha fin</span><input type="date" value={form.deadline} onChange={(event) => setForm({ ...form, deadline: event.target.value })} /></label>
              <label className="wide">
                <span>Lugar o punto de encuentro *</span>
                <div className="location-field">
                  <input required list="agenda-community-options" value={form.community} onChange={(event) => setForm({ ...form, community: event.target.value, place_source: "FREE" })} placeholder="Nombre, dirección, comunidad o referencia" />
                  <button type="button" onClick={() => setPicker(true)}>{form.activity_type === "CAMINATA" ? "Dibujar ruta" : "Seleccionar punto"}</button>
                </div>
                <datalist id="agenda-community-options">{communities.map((item) => <option key={item.community_normalized} value={item.community_label} />)}</datalist>
                <small>{form.latitude !== null && form.longitude !== null ? `Punto exacto del mapa · ${form.latitude.toFixed(6)}, ${form.longitude.toFixed(6)}` : "Escribe el lugar y marca libremente el punto en el mapa."}</small>
              </label>
              <label>
                <span>Responsable *</span>
                <select value={form.responsible_person_id} onChange={(event) => setForm({ ...form, responsible_person_id: event.target.value })}>
                  <option value="">Seleccionar del CRM…</option>
                  {people.map((person) => <option key={person.id} value={person.id}>{person.full_name}{person.role ? ` · ${person.role}` : ""}</option>)}
                </select>
                {!people.length ? <small><Link to={`/municipio/${municipality_code}/directorio?view=team`}>Primero agrega personas al CRM →</Link></small> : null}
              </label>
              <label><span>Estado</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>{["PLANIFICADA", "CONFIRMADA", "COMPLETADA", "CANCELADA"].map((item) => <option key={item}>{item}</option>)}</select></label>
              <fieldset className="wide agenda-elector-picker agenda-team-picker">
                <legend>Participantes del equipo (opcional)</legend>
                <label><input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="Buscar por nombre, cargo o comunidad" /></label>
                {teamResults.length ? <div className="agenda-elector-results">{teamResults.map((person) => <button type="button" key={person.id} onClick={() => addTeamParticipant(person.id)}><b>{person.full_name}</b><span>{person.role || person.community}</span></button>)}</div> : null}
                <div className="agenda-selected-electors">{selectedTeam.map((person) => <span key={person.id}><b>{person.full_name}</b><small>{person.role || person.community}</small><button type="button" onClick={() => setForm((current) => ({ ...current, participant_ids: current.participant_ids.filter((id) => id !== person.id) }))}>×</button></span>)}</div>
              </fieldset>
              <fieldset className="wide agenda-elector-picker">
                <legend>Electores participantes (opcional)</legend>
                <label><input value={electorQuery} onChange={(event) => setElectorQuery(event.target.value)} placeholder="Buscar por nombre" /></label>
                {electorResults.length ? <div className="agenda-elector-results">{electorResults.map((elector) => <button type="button" key={elector.id} onClick={() => addElector(elector)}><b>{elector.full_name}</b><span>{elector.community}</span></button>)}</div> : null}
                <div className="agenda-selected-electors">{selectedElectors.map((elector) => <span key={elector.id}><b>{elector.full_name}</b><small>{elector.community}</small><button type="button" onClick={() => { setSelectedElectors((current) => current.filter((item) => item.id !== elector.id)); setForm((current) => ({ ...current, elector_ids: current.elector_ids.filter((id) => id !== elector.id) })); }}>×</button></span>)}</div>
              </fieldset>
              <label className="wide"><span>Participantes o grupos de interés escritos manualmente (opcional)</span><textarea rows={2} value={form.manual_participants} onChange={(event) => setForm({ ...form, manual_participants: event.target.value })} placeholder="Ej. COCODE El Progreso; grupo de pescadores; invitados pendientes" /></label>
              {form.activity_type === "CAMINATA" ? <label><span>Color de ruta</span><input type="color" value={form.route_color} onChange={(event) => setForm({ ...form, route_color: event.target.value })} /></label> : null}
              {form.checklist_template ? <label><span>Checklist vinculado</span><input readOnly value={form.checklist_template === "MITIN_OPERATIVO" ? "Mitin · operación y montaje" : "Caminata / caravana · seguridad y territorio"} /></label> : null}
              <label className="wide">
                <span>Temas / objetivo / notas</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                />
              </label>
            </div>
            <V70RouteSnapshot activity={formPreview} />
            {message ? <p className="form-error">{message}</p> : null}
            <footer className="agenda-form-footer">
              {editing ? <button className="record-delete-action" type="button" onClick={() => void removeActivity(editing)}>Eliminar actividad</button> : null}
              {editing ? <button className="agenda-print-action" type="button" onClick={() => printActivity(formPreview)}>Imprimir PNG</button> : null}
              {editing ? <span className="agenda-footer-spacer" /> : null}
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button disabled={saving}>
                {saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar en Agenda"}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
      {picker ? (
        <div className="agenda-modal">
          <V70LocationPicker
            routeMode={form.activity_type === "CAMINATA"}
            latitude={form.latitude ?? undefined}
            longitude={form.longitude ?? undefined}
            points={form.route_points}
            color={form.route_color}
            onClose={() => setPicker(false)}
            onConfirm={(value) => {
              setForm({ ...form, latitude: value.latitude, longitude: value.longitude, route_points: value.points, community: value.locationName || form.community, place_source: "MAP" });
              setPicker(false);
            }}
          />
        </div>
      ) : null}
    </>
  );
}

export function V70DirectAgenda0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="agenda"
        eyebrow="OPERACIÓN"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <AgendaContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
