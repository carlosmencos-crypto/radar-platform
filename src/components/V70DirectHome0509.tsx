import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { loadCampaignBundle, loadCampaignRecords, type CampaignActivityRecord, type CampaignCommitmentRecord, type CampaignModuleRecord } from "../data/radarRuntime";
import { buildMunicipalIntelligenceModel, finite, formatDecimal, formatInteger, formatPercent } from "../data/v70MunicipalIntelligence";
import { getInstalledRadarElectoralLayers } from "../data/radarRuntimeCache";
import { V70CampaignIdentity } from "./V70CampaignIdentity";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import {
  useV70CampaignBrand,
  type V70SlateMember,
} from "./useV70CampaignBrand";
function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}
function SlateMember({
  member,
}: {
  member: V70SlateMember;
}) {
  const { municipality_code } = useMunicipalityContext();
  return (
    <article className="slate-member">
      <span className="slate-member-avatar">
        {member.photoUrl ? (
          <img src={member.photoUrl} alt={`Fotografía de ${member.fullName}`} />
        ) : (
          <i>{initials(member.fullName)}</i>
        )}
      </span>
      <span className="slate-member-identity">
        <b className="slate-member-name slate-member-name-static">
          {member.fullName}
        </b>
        <em>{member.positionLabel}</em>
      </span>
      <nav>
        <Link to={`/municipio/${municipality_code}/agenda?new=1&responsiblePersonId=${member.contact?.id ?? ""}&responsible=${encodeURIComponent(member.fullName)}`}>Agenda</Link>
        <Link to={`/municipio/${municipality_code}/estrategia-legal?candidate=${member.code}`}>Documentos</Link>
      </nav>
    </article>
  );
}
function greetingForGuatemala() {
  const hour = Number(
    new Intl.DateTimeFormat("es-GT", {
      timeZone: "America/Guatemala",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  if (hour < 12) return "BUENOS DÍAS";
  if (hour < 19) return "BUENAS TARDES";
  return "BUENAS NOCHES";
}
function HomeContent() {
  const { campaign_id, municipality_code, municipality_name, department_name } = useMunicipalityContext();
  const { runtime } = useAuthorizedRadarRuntime();
  const electoralLayers = getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const municipalModel = useMemo(
    () => buildMunicipalIntelligenceModel(runtime, electoralLayers),
    [runtime, electoralLayers],
  );
  const { slate } = useV70CampaignBrand();
  const [activities, setActivities] = useState<CampaignActivityRecord[]>([]);
  const [commitments, setCommitments] = useState<CampaignCommitmentRecord[]>([]);
  const [commitmentRecords, setCommitmentRecords] = useState<CampaignModuleRecord[]>([]);
  useEffect(() => {
    let cancelled = false; if (!campaign_id) return;
    void ensureRadarAccessToken().then(async (token) => Promise.all([loadCampaignBundle(campaign_id, token), loadCampaignRecords(campaign_id, "agenda", token)])).then(([bundle, records]) => { if (!cancelled) { setActivities(bundle.activities); setCommitments(bundle.commitments); setCommitmentRecords((records ?? []).filter((item) => item.category === "COMPROMISO")); } }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [campaign_id]);
  const today = new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());
  const mayor = slate.filter((item) => item.group === "ALCALDE");
  const syndics = slate.filter((item) => item.group === "SÍNDICOS");
  const councilors = slate.filter((item) => item.group === "CONCEJALES");
  const todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const activitiesToday = activities.filter((item) => item.starts_at && new Intl.DateTimeFormat("en-CA", { timeZone: "America/Guatemala", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(item.starts_at)) === todayKey).length;
  const openCommitments = commitments.filter((item) => item.status !== "cumplido").length + commitmentRecords.filter((item) => item.status !== "CUMPLIDO").length;
  const coveredTerritories = new Set(activities.filter((item) => item.status.toUpperCase() !== "CANCELADA" && Number.isFinite(item.latitude) && Number.isFinite(item.longitude)).map((item) => item.community?.trim()).filter(Boolean)).size;
  const knownTerritories = runtime.voter_roll.aggregates.find((item) => item.community_count)?.community_count ?? 0;
  const territoryCoverage = knownTerritories > 0 ? Math.min(100, Math.round((coveredTerritories / knownTerritories) * 100)) : 0;
  const localPriorityThemes = municipalModel.priorities.map((item) => ({ title: item.title, detail: `${item.value} · ${item.detail}` }));
  const localOpportunityThemes = municipalModel.opportunities.map((item) => ({ title: item.title, detail: `${item.value} · ${item.detail}` }));
  const census = municipalModel.payload("INE_CENSO_B2_B6");
  const services = municipalModel.payload("RGM_SERVICIOS");
  const health = municipalModel.payload("MSPAS_SALUD");
  const risk = municipalModel.payload("CONRED_INFORM");
  const schools = municipalModel.payload("MINEDUC_ESCUELAS");
  return (
    <>
      <section className="command-hero home-welcome">
        <div className="home-welcome-copy">
          <p>{greetingForGuatemala()}, EQUIPO</p>
          <small>Centro de control electoral 2027</small>
          <h1>{municipality_name}</h1>
          <span className="campaign-type">Campaña Alcaldía</span>
        </div>
        <V70CampaignIdentity />
      </section>
      <section
        className="home-reminder-bar"
        aria-label="Resumen de la fecha y cobertura territorial"
      >
        <div>
          <small>{today.toUpperCase()}</small>
        </div>
        <div className="territory-coverage">
          <small>TERRITORIO CUBIERTO</small>
          <b>{territoryCoverage}%</b>
          <i aria-label="Calculado con actividades geolocalizadas">RADAR</i>
        </div>
        <Link to={`/municipio/${municipality_code}/agenda`}>
          Revisar pendientes →
        </Link>
      </section>
      <section
        className="command-kpis"
        aria-label="Indicadores operativos en vivo"
      >
        <article>
          <small>Actividades de hoy</small>
          <b>{activitiesToday}</b>
        </article>
        <article>
          <small>Compromisos abiertos</small>
          <b>{openCommitments}</b>
        </article>
        <article>
          <small>Territorios con actividades</small>
          <b>{coveredTerritories}</b>
        </article>
      </section>
      <section className="slate-overview" aria-labelledby="slate-title">
        <header>
          <div>
            <small>CAMPAÑA MUNICIPAL</small>
            <h2 id="slate-title">Planilla Municipal</h2>
            <p>
              Vista rápida del equipo, avance de su agenda y documentos legales
            </p>
          </div>
        </header>
        {!slate.length ? <p className="trace-note">La composición de la planilla requiere una base demográfica oficial validada para este municipio.</p> : <p className="trace-note">Titulares y suplentes · TSE, Acuerdo 327-2026. Los nombres se completan con el equipo de la campaña.</p>}
        <div className="slate-groups slate-groups-compact">
          <section className="slate-group-mayor">
            <header>
              <h3>Alcalde</h3>
              <b>{mayor.length}</b>
            </header>
            <div className="slate-member-list">
              {mayor.map((member, index) => (
                <SlateMember key={`m-${index}`} member={member} />
              ))}
            </div>
          </section>
          <section className="slate-group-syndics">
            <header>
              <h3>Síndicos</h3>
              <b>{syndics.length}</b>
            </header>
            <div className="slate-member-list">
              {syndics.map((member, index) => (
                <SlateMember key={`s-${index}`} member={member} />
              ))}
            </div>
          </section>
          <section className="slate-group-councilors">
            <header>
              <h3>Concejales</h3>
              <b>{councilors.length}</b>
            </header>
            <div className="slate-member-list slate-member-list-councilors">
              {councilors.map((member, index) => (
                <SlateMember key={`c-${index}`} member={member} />
              ))}
            </div>
          </section>
        </div>
      </section>
      <section
        className="home-municipality-context"
        aria-labelledby="municipal-context-title"
      >
        <header>
          <small>CONTEXTO MUNICIPAL</small>
          <h2 id="municipal-context-title">{municipality_name}</h2>
        </header>
        <p><b>{municipality_name} · {department_name}</b> combina exclusivamente evidencia territorial, electoral, social y financiera autorizada para el municipio {municipality_code}. Los vacíos permanecen visibles y no se sustituyen con datos de otro territorio.</p><div>
          <article><small>SERVICIOS BÁSICOS</small><b>{formatPercent(finite(census.water_pipe_inside_pct))} con agua dentro</b><span>Índice de servicios: {formatDecimal(finite(services.indice_servicios_publicos), 3)} · universos históricos.</span></article>
          <article><small>SALUD</small><b>{formatInteger(finite(health.records))} establecimientos</b><span>{formatInteger(finite(health.map_publishable))} georreferenciados · MSPAS.</span></article>
          <article><small>RIESGO TERRITORIAL</small><b>{formatDecimal(finite(risk.inform_risk))}</b><span>INFORM 2021 · puesto nacional {formatInteger(finite(risk.national_rank))}.</span></article>
          <article><small>EDUCACIÓN</small><b>{formatInteger(finite(schools.records))} registros</b><span>{formatInteger(finite(schools.level_primaria))} primaria · {formatInteger(finite(schools.level_basico))} básico.</span></article>
        </div>
        <Link to={`/municipio/${municipality_code}/inteligencia`}>
          Abrir Inteligencia Municipal →
        </Link>
      </section>
      <section
        className="home-talking-points"
        aria-labelledby="talking-points-title"
      >
        <header>
          <small>GUÍA DINÁMICA</small>
          <h2 id="talking-points-title">¿De qué hablar?</h2>
        </header>
        <div>
          <article className="priority">
            <h3>Temas prioritarios</h3>
            <p>Lo que requiere atención</p>
            <ul>
              {localPriorityThemes.map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
          <article className="opportunity">
            <h3>Oportunidades</h3>
            <p>Fortalezas aprovechables</p>
            <ul>
              {localOpportunityThemes.map((item) => (
                <li key={item.title}>
                  <b>{item.title}</b>
                  <span>{item.detail}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>
    </>
  );
}
export function V70DirectHome0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="inicio"
        eyebrow="CENTRO DE MANDO"
        topbarTitle={municipalityTitle}
      >
        <HomeContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
