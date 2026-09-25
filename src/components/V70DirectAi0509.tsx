import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  loadCampaignBundle,
  loadCampaignContacts,
  loadCampaignRecords,
  loadAuthorizedPulse,
  type AuthorizedPulseMeasurement,
  type CampaignBundle,
  type CampaignContactRecord,
  type CampaignModuleRecord,
} from "../data/radarRuntime";
import {
  getInstalledRadarGeoBundle,
  getInstalledRadarRuntime,
  getInstalledRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import { V70DirectShell0509 } from "./V70DirectShell0509";

type PuterUser = { username?: string };
type PuterResponse = string | { text?: string; message?: { content?: string | Array<{ text?: string }> } };
type PuterChunk = { type?: string; text?: string; message?: string };
type PuterStream = AsyncIterable<PuterChunk>;
type PuterMessage = { role: "system" | "assistant" | "user"; content: string };
type PuterApi = {
  auth: {
    isSignedIn: () => boolean;
    signIn: (options?: { attempt_temp_user_creation?: boolean }) => Promise<unknown>;
    signOut: () => Promise<unknown>;
    getUser: () => Promise<PuterUser>;
  };
  ai: { chat: (messages: PuterMessage[], options?: Record<string, unknown>) => Promise<PuterResponse | PuterStream> };
};

declare global { interface Window { puter?: PuterApi } }

const taskOptions = [
  { value: "organizar", label: "Ordenar y priorizar", short: true },
  { value: "resumir", label: "Resumen ejecutivo", short: true },
  { value: "revisar", label: "Mejorar un campo", short: true },
  { value: "consulta", label: "Análisis de campaña", short: false },
  { value: "intervencion", label: "Plan de acción", short: false },
] as const;
type TaskValue = (typeof taskOptions)[number]["value"];
type ConversationTurn = { id: string; role: "user" | "assistant"; content: string };
type SourceState = { label: string; detail: string; ready: boolean };
type RadarPortalContext = { text: string; sources: SourceState[] };

const starterQuestions = [
  "¿Cuáles son las tres prioridades reales de la campaña esta semana y por qué?",
  "¿Qué información falta para tomar mejores decisiones en el municipio?",
  "Resume el estado de Agenda, responsables y compromisos abiertos.",
  "¿Qué comunidades grandes tienen menor cobertura operativa?",
  "Propón un plan de 7 días con responsables y resultados verificables.",
  "Revisa nuestro mensaje central frente a los problemas municipales documentados.",
  "¿Qué riesgos legales, financieros u operativos requieren atención inmediata?",
  "Prepara un brief para la próxima actividad territorial.",
  "¿Qué debe verificar el centro de mando antes del Día D?",
  "Compara los últimos pulsos electorales sin mezclar universos ni fechas.",
];

function extractText(response: PuterResponse) {
  if (typeof response === "string") return response;
  if (response.text) return response.text;
  const content = response.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((item) => item.text || "").join("\n");
  return "";
}
function isStream(value: PuterResponse | PuterStream): value is PuterStream {
  return typeof value === "object" && value !== null && Symbol.asyncIterator in value;
}
function clip(value: unknown, limit = 260) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function countValues(values: string[]) {
  const counts = values.reduce<Record<string, number>>((result, value) => {
    const name = value || "Sin clasificar";
    result[name] = (result[name] ?? 0) + 1;
    return result;
  }, {});
  return Object.entries(counts).map(([name, value]) => `${name}: ${value}`).join(" · ") || "Sin registros";
}
function buildPortalContext({ municipalityCode, municipalityName, departmentName, campaignId, userRole, bundle, contacts, records, pulse }: {
  municipalityCode: string;
  municipalityName: string;
  departmentName: string;
  campaignId: string;
  userRole: string;
  bundle: CampaignBundle;
  contacts: CampaignContactRecord[];
  records: Record<string, CampaignModuleRecord[]>;
  pulse: AuthorizedPulseMeasurement[];
}): RadarPortalContext {
  const profile = findMunicipalProfile(municipalityCode);
  const intelligence = profile?.intelligence;
  const runtime = getInstalledRadarRuntime(municipalityCode);
  const geo = getInstalledRadarGeoBundle(municipalityCode);
  const communities = getInstalledRadarVoterCommunities(municipalityCode) ?? [];
  const activeContacts = contacts.filter((contact) => contact.active);
  const candidates = activeContacts.filter((contact) => contact.contact_type === "Candidato");
  const plan = (records.estrategia ?? []).filter((record) => record.status !== "ARCHIVADO").slice(0, 16);
  const finances = (records.finanzas ?? []).filter((record) => record.status !== "ARCHIVADO");
  const money = (category: string) => finances.filter((record) => record.category === category).reduce((sum, record) => sum + Number(record.payload?.amount || 0), 0);
  const dayD = (records["dia-d"] ?? []).filter((record) => record.status !== "ARCHIVADO");
  const commitments = (records.agenda ?? []).filter((record) => record.category === "COMPROMISO" && record.status !== "ARCHIVADO");
  const publicModules = profile?.modules.filter((module) => module.id !== "fuentes").map((module) => `${module.title}: ${module.metrics.map((metric) => `${metric.label} ${metric.value}`).join("; ")}`).join("\n") || "Sin expediente municipal cargado";
  const catalogCommunities = runtime?.intelligence_profile?.community_catalog.records ?? [];
  const topCommunities = [...communities].sort((a, b) => b.elector_count - a.elector_count).slice(0, 12).map((community) => `${community.community_label}: ${community.elector_count} electores`).join("; ")
    || catalogCommunities.slice(0, 24).map((community) => `${String(community.name || "Comunidad sin nombre")} · ${String(community.group || "agrupación no publicada")}`).join("; ")
    || "Sin catálogo comunitario autorizado";
  const electoralHistory = (runtime?.intelligence_profile?.electoral_history.elections ?? []).map((raw) => {
    const ranking = Array.isArray(raw.results)
      ? raw.results.slice(0, 5).map((result) => {
        const row = result && typeof result === "object" ? result as Record<string, unknown> : {};
        return `${String(row.party || "—")} ${Number(row.votes || 0).toLocaleString("es-GT")} votos`;
      }).join("; ")
      : "ranking no publicado";
    return `${Number(raw.year)}: ${String(raw.winner_candidate || "alcalde no publicado")} · ${String(raw.winner_party || "organización no publicada")}. Principales fuerzas: ${ranking}`;
  }).join("\n") || "Histórico electoral no publicado";
  const activityLines = [...bundle.activities].sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at))).slice(0, 24).map((activity) => `${activity.starts_at || "Sin fecha"} | ${clip(activity.title, 90)} | ${activity.status} | ${activity.community || "Sin ubicación"} | responsable ${clip(activity.details?.responsible || "pendiente", 80)}`).join("\n") || "Sin actividades";
  const planLines = plan.map((record) => `${record.category}: ${clip(record.title, 120)}${record.details ? ` — ${clip(record.details)}` : ""} [${record.status}]`).join("\n") || "Plan sin campos guardados";
  const commitmentLines = [
    ...bundle.commitments.map((item) => `${item.title} | ${item.status} | vence ${item.due_date || "sin fecha"} | responsable ${item.responsible || "pendiente"}`),
    ...commitments.map((item) => `${item.title} | ${item.status} | vence ${String(item.payload?.due_date || "sin fecha")} | responsable ${clip(item.payload?.responsible || "pendiente", 80)}`),
  ].slice(0, 20).join("\n") || "Sin compromisos";
  const candidateLines = candidates.map((candidate) => `${candidate.file_code || "Sin código"} · ${candidate.candidate_position || "Candidatura"} · ${candidate.full_name}`).join("\n") || "Sin planilla registrada";
  const pulseLines = pulse.slice(0, 12).map((measurement) => `${measurement.field_end} | ${measurement.election_type} | ${measurement.scope_label} | muestra ${measurement.sample_size} | ${measurement.results.slice(0, 5).map((result) => `${result.candidate_name} ${Number(result.value).toFixed(1)}%`).join("; ")}`).join("\n") || "Sin mediciones reales publicadas";
  const text = `CONTEXTO AUTORIZADO DE RADAR\nMunicipio: ${municipalityName} (${municipalityCode}), ${departmentName}. Campaña: ${campaignId}. Rol: ${userRole}.\n\nINTELIGENCIA MUNICIPAL [Data Vault]\nPoblación proyectada: ${intelligence?.populationProjection || "no registrada"}. Padrón activo: ${intelligence?.voterRegister || "no registrado"}. Centros/JRV: ${intelligence?.votingCenters || "—"}/${intelligence?.votingBoards || "—"}. Cobertura geográfica autorizada: ${geo?.features.length ?? runtime?.geo.feature_total ?? 0} puntos.\n${publicModules}\nHistórico electoral municipal:\n${electoralHistory}\nComunidades autorizadas: ${topCommunities}\n\nIDENTIDAD Y PLANILLA [Campaign Vault]\nCandidato principal: ${bundle.identity?.candidate_name || "no registrado"}. Partido: ${bundle.identity?.party_name || "no registrado"}.\n${candidateLines}\n\nPLAN DE CAMPAÑA [Estrategia]\n${planLines}\n\nAGENDA Y MAPA [Operación]\n${activityLines}\n\nCOMPROMISOS [Agenda]\n${commitmentLines}\n\nCONTROL FINANCIERO [Finanzas]\nPresupuesto general: Q ${money("Presupuesto").toFixed(2)}. Ingresos: Q ${money("Ingreso").toFixed(2)}. Egresos: Q ${money("Egreso").toFixed(2)}. Registros: ${finances.length}.\n\nDÍA D Y RTD\n${countValues(dayD.map((record) => record.category))}. Estados: ${countValues(dayD.map((record) => record.status))}.\n\nRECURSOS Y CONTROL DOCUMENTAL\nRecursos: ${countValues((records.recursos ?? []).map((record) => record.category))}. Legal: ${countValues((records.legal ?? []).map((record) => record.status))}. Comunicación: ${countValues((records.medios ?? []).map((record) => record.category))}.\n\nDIRECTORIO (solo agregados, sin DPI, teléfonos ni correos)\n${activeContacts.length} contactos activos. ${countValues(activeContacts.map((contact) => contact.contact_type))}.\n\nPULSO ELECTORAL [alcance autorizado]\n${pulseLines}`;
  return {
    text,
    sources: [
      { label: "Inteligencia Municipal", detail: `${profile?.modules.length ?? 0} áreas públicas`, ready: Boolean(profile) },
      { label: "Estrategia", detail: `${plan.length} campos vigentes`, ready: plan.length > 0 },
      { label: "Agenda y Mapa", detail: `${bundle.activities.length} actividades`, ready: true },
      { label: "Compromisos", detail: `${bundle.commitments.length + commitments.length} registros`, ready: true },
      { label: "Finanzas", detail: `${finances.length} registros`, ready: true },
      { label: "Día D / RTD", detail: `${dayD.length} registros`, ready: true },
      { label: "Recursos y Legal", detail: `${(records.recursos ?? []).length + (records.legal ?? []).length} registros`, ready: true },
      { label: "Pulso Electoral", detail: pulse.length ? `${pulse.length} mediciones publicadas` : "Sin mediciones reales", ready: pulse.length > 0 },
    ],
  };
}

export function RadarAssistant({ initialPrompt = "", compact = false, onApply }: { initialPrompt?: string; compact?: boolean; onApply?: (value: string) => void } = {}) {
  const municipality = useMunicipalityContext();
  const [scriptReady, setScriptReady] = useState(Boolean(typeof window !== "undefined" && window.puter));
  const [puterUser, setPuterUser] = useState<PuterUser | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [task, setTask] = useState<TaskValue>(compact ? "revisar" : "organizar");
  const [input, setInput] = useState(initialPrompt);
  const [conversation, setConversation] = useState<ConversationTurn[]>([]);
  const [portalContext, setPortalContext] = useState<RadarPortalContext | null>(null);
  const [contextStatus, setContextStatus] = useState("Cargando contexto autorizado…");
  const [status, setStatus] = useState("");
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);
  const selectedTask = useMemo(() => taskOptions.find((option) => option.value === task) ?? taskOptions[0], [task]);
  const latestResult = [...conversation].reverse().find((turn) => turn.role === "assistant" && turn.content)?.content ?? "";

  useEffect(() => { setInput(initialPrompt); setConversation([]); }, [initialPrompt]);
  useEffect(() => {
    if (window.puter) {
      setScriptReady(true);
      if (window.puter.auth.isSignedIn()) void window.puter.auth.getUser().then(setPuterUser).catch(() => setPuterUser(null));
      return;
    }
    const existing = document.getElementById("puter-js") as HTMLScriptElement | null;
    const script = existing ?? document.createElement("script");
    if (!existing) { script.id = "puter-js"; script.src = "https://js.puter.com/v2/"; script.async = true; document.head.appendChild(script); }
    const ready = () => { setScriptReady(true); if (window.puter?.auth.isSignedIn()) void window.puter.auth.getUser().then(setPuterUser).catch(() => setPuterUser(null)); };
    script.addEventListener("load", ready);
    return () => script.removeEventListener("load", ready);
  }, []);
  useEffect(() => {
    let cancelled = false;
    if (!municipality.campaign_id) { setContextStatus("La sesión no tiene una campaña autorizada."); return; }
    void ensureRadarAccessToken().then(async (token) => {
      const moduleKeys = ["estrategia", "legal", "finanzas", "medios", "agenda", "dia-d", "recursos"];
      const [bundle, contacts, pulse, ...moduleRows] = await Promise.all([
        loadCampaignBundle(municipality.campaign_id, token),
        loadCampaignContacts(municipality.campaign_id, token),
        municipality.is_demo
          ? Promise.resolve([] as AuthorizedPulseMeasurement[])
          : loadAuthorizedPulse(municipality.municipality_code, token).catch(() => [] as AuthorizedPulseMeasurement[]),
        ...moduleKeys.map((moduleKey) => loadCampaignRecords(municipality.campaign_id, moduleKey, token)),
      ]);
      if (cancelled) return;
      setPortalContext(buildPortalContext({ municipalityCode: municipality.municipality_code, municipalityName: municipality.municipality_name, departmentName: municipality.department_name, campaignId: municipality.campaign_id, userRole: municipality.user_role, bundle, contacts, pulse, records: Object.fromEntries(moduleKeys.map((key, index) => [key, moduleRows[index] ?? []])) }));
      setContextStatus("Contexto vigente y aislado para esta campaña.");
    }).catch((error: unknown) => { if (!cancelled) { setPortalContext(null); setContextStatus(error instanceof Error ? error.message : "No se pudo cargar el contexto autorizado."); } });
    return () => { cancelled = true; };
  }, [municipality.campaign_id, municipality.department_name, municipality.is_demo, municipality.municipality_code, municipality.municipality_name, municipality.user_role]);

  async function connect() {
    if (!window.puter) { setStatus("La conexión todavía está cargando. Intenta nuevamente en unos segundos."); return; }
    setConnecting(true); setStatus("");
    try { if (!window.puter.auth.isSignedIn()) await window.puter.auth.signIn({ attempt_temp_user_creation: false }); setPuterUser(await window.puter.auth.getUser()); }
    catch (error) { setStatus(error instanceof Error ? error.message : "No se pudo completar la conexión."); }
    finally { setConnecting(false); }
  }
  async function disconnect() { if (!window.puter) return; await window.puter.auth.signOut(); setPuterUser(null); setConversation([]); setStatus("Cuenta Puter desconectada de este navegador."); }
  async function run() {
    if (!window.puter || !puterUser || !input.trim() || !portalContext) return;
    const prompt = input.trim();
    const userTurn: ConversationTurn = { id: `user-${Date.now()}`, role: "user", content: prompt };
    const assistantId = `assistant-${Date.now()}`;
    const history = conversation.slice(-10);
    setConversation((current) => [...current, userTurn, { id: assistantId, role: "assistant", content: "" }]);
    setInput(""); setWorking(true); setStatus("");
    const system = `Eres IA RADAR, asistente interno de una campaña municipal. Responde como un analista operativo claro, conversacional y útil. Usa únicamente el contexto autorizado que aparece abajo. No inventes cifras, actividades, acuerdos ni responsables; cuando falte un dato, di "no está registrado en RADAR". Separa hechos, inferencias y recomendaciones. Cita el módulo entre corchetes cuando uses un dato, por ejemplo [Agenda] o [Inteligencia Municipal]. No solicites ni reproduzcas DPI/CUI, teléfonos, correos ni perfiles individuales de electores. No publiques ni apruebes decisiones: entrega material listo para revisión humana. Mantén separados los universos municipal, departamental y nacional.\n\n${portalContext.text}`;
    const messages: PuterMessage[] = [
      { role: "system", content: system },
      ...history.map((turn) => ({ role: turn.role, content: turn.content })),
      { role: "user", content: `Tarea seleccionada: ${selectedTask.label}.\n\n${prompt}` },
    ];
    try {
      const response = await window.puter.ai.chat(messages, { model: "gpt-5.5", stream: true, normalize: true, max_tokens: selectedTask.short ? 1400 : 3000, reasoning_effort: selectedTask.short ? "low" : "medium", verbosity: selectedTask.short ? "low" : "medium" });
      let text = "";
      if (isStream(response)) {
        for await (const chunk of response) {
          if (chunk.type === "error") throw new Error(chunk.message || "El modelo interrumpió la respuesta.");
          if (chunk.type !== "text" || !chunk.text) continue;
          text += chunk.text;
          setConversation((current) => current.map((turn) => turn.id === assistantId ? { ...turn, content: text } : turn));
        }
      } else {
        text = extractText(response).trim();
        setConversation((current) => current.map((turn) => turn.id === assistantId ? { ...turn, content: text } : turn));
      }
      if (!text.trim()) throw new Error("El servicio respondió sin texto. Probá de nuevo.");
    } catch (error) {
      setConversation((current) => current.filter((turn) => turn.id !== assistantId));
      setStatus(error instanceof Error ? error.message : "No se pudo completar la consulta.");
    } finally { setWorking(false); }
  }
  async function copy() { if (!latestResult) return; await navigator.clipboard.writeText(latestResult); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }

  return <section className={`radar-ai-assistant${compact ? " compact" : ""}`}>
    <header className="radar-ai-statusbar"><div><span className={`radar-ai-dot ${portalContext ? "ready" : ""}`} /><p><b>{municipality.municipality_name}</b><small>{contextStatus}</small></p></div>{puterUser ? <div className="radar-ai-account"><span>Conectado como <b>{puterUser.username ?? "usuario Puter"}</b></span><button type="button" onClick={() => void disconnect()}>Desconectar</button></div> : null}</header>
    <div className="radar-ai-context-strip" aria-label="Fuentes disponibles">{(portalContext?.sources ?? []).map((source) => <span className={source.ready ? "ready" : "pending"} key={source.label}><b>{source.label}</b><small>{source.detail}</small></span>)}</div>
    {!puterUser ? <div className="radar-ai-gate"><div><b>Conecta tu cuenta Puter.</b><span>RADAR no recibe ni guarda tu contraseña. La conexión vive en este navegador.</span></div><button type="button" disabled={!scriptReady || connecting} onClick={() => void connect()}>{connecting ? "Conectando…" : scriptReady ? "Conectar Puter" : "Cargando conexión…"}</button></div> : <div className="radar-ai-workbench">
      {!compact && !conversation.length ? <div className="radar-ai-starters"><small>PREGUNTAS PARA EMPEZAR</small>{starterQuestions.map((question) => <button type="button" key={question} onClick={() => { setInput(question); setTask("consulta"); }}>{question}</button>)}</div> : null}
      {conversation.length ? <div className="radar-ai-conversation" aria-live="polite">{conversation.map((turn) => <article className={turn.role} key={turn.id}><small>{turn.role === "user" ? "TÚ" : "IA RADAR"}</small><div>{turn.content || "Analizando el contexto autorizado…"}</div></article>)}</div> : null}
      <div className="radar-ai-toolbar"><label><span>Tipo de ayuda</span><select value={task} onChange={(event) => setTask(event.target.value as TaskValue)}>{taskOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label><p><span>GPT-5.5 · contexto RADAR</span><small>{selectedTask.short ? "Respuesta breve y puntual" : "Análisis con mayor desarrollo"}</small></p>{conversation.length ? <button type="button" onClick={() => { setConversation([]); setStatus(""); }}>Nueva conversación</button> : null}</div>
      <label className="radar-ai-prompt"><span>{conversation.length ? "Continuar la conversación" : "Información o consulta"}</span><textarea rows={compact ? 5 : 7} value={input} maxLength={8000} onChange={(event) => setInput(event.target.value)} placeholder="Pregunta sobre inteligencia, estrategia, agenda, mapa, finanzas, recursos o Día D. No incluyas DPI ni datos personales." /><small>{input.length.toLocaleString("es-GT")} / 8,000</small></label>
      <div className="radar-ai-actions"><button type="button" className="primary" disabled={working || !input.trim() || !portalContext} onClick={() => void run()}>{working ? "IA RADAR está respondiendo…" : conversation.length ? "Enviar mensaje" : "Preparar propuesta"}</button><span>Usa resúmenes autorizados del portal; no envía el CRM individual.</span></div>
      {latestResult ? <div className="radar-ai-result-actions">{onApply ? <button type="button" onClick={() => onApply(latestResult)}>Aplicar la última respuesta</button> : null}<button type="button" onClick={() => void copy()}>{copied ? "Copiado" : "Copiar última respuesta"}</button></div> : null}
    </div>}
    {status ? <p className="radar-ai-message" role="status">{status}</p> : null}
    <footer className="radar-ai-boundary"><span>Uso interno</span><p>IA RADAR usa el contexto autorizado del municipio y la campaña, pero toda recomendación requiere revisión humana. No recibe DPI/CUI, teléfonos ni correos del directorio.</p></footer>
  </section>;
}

function AiContent() { return <><section className="section-banner"><div className="section-banner-copy"><p>CAPA TRANSVERSAL</p><h1>IA RADAR</h1><span>Conversar con la inteligencia municipal y la operación autorizada de la campaña</span></div></section><main className="radar-ai-page"><section className="ai-source-scope"><header><small>CONTEXTO AUTORIZADO</small><h2>Una sola capa de consulta</h2><p>IA RADAR relaciona inteligencia, estrategia, agenda, mapa, finanzas, recursos y Día D sin copiar el CRM individual al modelo.</p></header><aside><b>Recomendación de IA ≠ decisión aprobada</b><span>Briefs, prioridades, resúmenes y borradores deben ser revisados por la campaña antes de convertirse en instrucciones o mensajes oficiales.</span></aside></section><RadarAssistant /></main></>; }

export function V70DirectAi0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="ia-radar" eyebrow="ASISTENCIA INTERNA" topbarTitle={municipalityTitle}><AiContent /></V70DirectShell0509></MunicipalityProvider>;
}
