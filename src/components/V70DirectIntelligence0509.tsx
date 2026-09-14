import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import { MunicipalityProvider } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { getInstalledRadarElectoralLayers, getInstalledRadarGeoBundle } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectoralViewModel } from "../data/v70ElectoralAdapter";
import { V70CanonicalRich0509 } from "./V70CanonicalRich0509";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70Ecosystem0509 } from "./V70Ecosystem0509";
import { V70ElectoralTerritory } from "./V70ElectoralTerritory";
import { V70ElectoralTerritoryUnavailable } from "./V70ElectoralTerritoryUnavailable";

type ActiveVoterProfile = { total_active?: number; cutoff_at?: string; age_total?: Record<string, number> };
const AGE_BANDS = [["18_25","18–25"],["26_30","26–30"],["31_35","31–35"],["36_40","36–40"],["41_45","41–45"],["46_50","46–50"],["51_55","51–55"],["56_60","56–60"],["61_65","61–65"],["66_70","66–70"],["70_plus","70+"]] as const;

function numberFromText(value?: string) { if (!value) return undefined; const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : undefined; }
function resolveViewModel(): V70ElectoralViewModel | null { const layers = getInstalledRadarElectoralLayers("0509") ?? []; if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null; try { return adaptAuthorizedElectoralTerritoryLayers(layers); } catch (error) { console.error("RADAR_V70_ELECTORAL_ADAPTER_FAIL_CLOSED", "0509", error); return null; } }

function IntelligenceContent() {
  const authorized = useAuthorizedRadarRuntime();
  const activeProfile = (authorized.runtime as typeof authorized.runtime & { elector_profile?: ActiveVoterProfile | null }).elector_profile ?? null;
  const profile = findMunicipalProfile("0509");
  const intelligence = profile?.intelligence;
  const geoBundle = getInstalledRadarGeoBundle("0509");
  const electoralView = useMemo(() => resolveViewModel(), []);
  const women = numberFromText(intelligence?.voterWomen); const men = numberFromText(intelligence?.voterMen); const sexTotal = (women ?? 0) + (men ?? 0);
  const womenShare = sexTotal > 0 && women !== undefined ? women / sexTotal * 100 : 0; const menShare = sexTotal > 0 && men !== undefined ? men / sexTotal * 100 : 0; const sexGap = women !== undefined && men !== undefined ? Math.abs(women - men) : undefined;
  const activeAges = useMemo(() => { const total = activeProfile?.total_active ?? 0; const ageTotal = activeProfile?.age_total; if (!ageTotal || total <= 0) return []; return AGE_BANDS.flatMap(([key,label]) => { const value = ageTotal[key]; return typeof value === "number" && Number.isFinite(value) ? [{ key, label, value, share: value / total * 100 }] : []; }); }, [activeProfile]);
  const fallbackAges = intelligence?.ages ?? [];
  const ageRows = activeAges.length ? activeAges : fallbackAges.map((item) => ({ key: item.label, label: item.label, value: Number(String(item.value).replace(/[^0-9.-]/g, "")) || 0, share: item.share }));
  const maxAgeShare = Math.max(...ageRows.map((item) => item.share), 1);
  const young = activeProfile?.age_total ? ["18_25","26_30","31_35","36_40"].reduce((sum,key)=>sum+(activeProfile.age_total?.[key] ?? 0),0) : 0;
  const youngShare = young > 0 && (activeProfile?.total_active ?? 0) > 0 ? young / (activeProfile?.total_active ?? 1) * 100 : null;

  if (!intelligence) return <section className="section"><div className="canonical-vault-notice"><span>NO_PUBLICADO</span><h3>Expediente municipal no disponible</h3><p>RADAR mantiene el vacío sin imputar datos.</p></div></section>;

  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — PUERTO SAN JOSÉ</p><h1>Inteligencia Municipal</h1><span>Fotografía estratégica del municipio para definir mensajes y prioridades</span></div></section>
    <section className="kpis" aria-label="Indicadores principales">
      <article><small>Población proyectada 2026</small><b>{intelligence.populationProjection || "—"}</b><em>INE · proyección oficial</em></article>
      <article><small>Padrón electoral activo 2026</small><b>{intelligence.voterRegister}</b><em>{intelligence.voterWomen ? `${intelligence.voterWomen} mujeres` : "TSE"}{intelligence.voterMen ? ` · ${intelligence.voterMen} hombres` : ""}</em></article>
      <article><small>Centros electorales geolocalizados</small><b>{intelligence.votingCenters || "—"} <i>centros</i></b><em>103 JRV · auditoría completada</em></article>
      <article><small>ORGANIZACIÓN COMUNITARIA TSE</small><b>{intelligence.communityRecords || "—"} <i>registros</i></b><em>9 agrupaciones territoriales del municipio</em></article>
    </section>
    <section className="section electorate-profile">
      <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026</p><h2>Quiénes pueden votar hoy</h2></div><p>Sexo, edad y alfabetismo provienen del padrón activo del TSE. La distribución urbana/rural pertenece al Censo 2018 y se muestra aparte para no mezclar universos.</p></div>
      <div className="electorate-hero">
        <article className="register-total"><span>PADRÓN ACTIVO</span><b>{intelligence.voterRegister}</b><p>Corte oficial: {intelligence.registerCut || "2026"}</p>{intelligence.registerGrowth ? <div><strong>{intelligence.registerGrowth}</strong><small>personas frente al padrón electoral 2023<br />comparación indicativa: +5.0%</small></div> : null}</article>
        {women !== undefined && men !== undefined ? <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span>{sexGap !== undefined ? <b>Brecha: {new Intl.NumberFormat("es-GT").format(sexGap)}</b> : null}</div><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{intelligence.voterWomen}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{intelligence.voterMen}</b><small>{menShare.toFixed(1)}%</small></span></div></article> : null}
        {intelligence.literacyRate ? <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{intelligence.literacyRate}</b>{intelligence.literatePeople ? <small>{intelligence.literatePeople} personas</small> : null}</div><div className="literacy-detail">{intelligence.womenLiteracy ? <span>Mujeres <b>{intelligence.womenLiteracy}</b></span> : null}{intelligence.menLiteracy ? <span>Hombres <b>{intelligence.menLiteracy}</b></span> : null}{intelligence.literacyUnregistered ? <span>Sin alfabetismo registrado <b>{intelligence.literacyUnregistered}</b></span> : null}</div></article> : null}
      </div>
      <div className="age-and-territory">
        {ageRows.length ? <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>{youngShare === null ? "Padrón activo" : `${youngShare.toFixed(1)}% tiene entre 18 y 40 años`}</b></div><div className="age-bars">{ageRows.map((item) => <div key={item.key}><span>{item.label}</span><i><em style={{ width: `${item.share / maxAgeShare * 100}%` }} /></i><b>{new Intl.NumberFormat("es-GT").format(item.value)}</b><small>{item.share.toFixed(1)}%</small></div>)}</div></article> : null}
        <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{intelligence.voterRegister}</b><small>Ciudadanos empadronados activos. La fuente actual no publica urbano/rural.</small></div>{intelligence.censusPopulation ? <div className="universe-block census"><span>INE · CENSO 2018</span><b>{intelligence.censusPopulation}</b><div className="rural-bar"><i style={{ width: `${intelligence.censusUrbanShare}%` }} /><em style={{ width: `${intelligence.censusRuralShare}%` }} /></div><p><strong>{intelligence.censusUrban} urbanos · {intelligence.censusUrbanShare.toFixed(1)}%</strong><strong>{intelligence.censusRural} rurales · {intelligence.censusRuralShare.toFixed(1)}%</strong></p></div> : null}{intelligence.populationProjection ? <div className="universe-block projection"><span>INE · PROYECCIÓN 2026</span><b>{intelligence.populationProjection}</b><small>{intelligence.projectionMen ? `${intelligence.projectionMen} hombres` : ""}{intelligence.projectionMen && intelligence.projectionWomen ? " · " : ""}{intelligence.projectionWomen ? `${intelligence.projectionWomen} mujeres` : ""}. Proyección poblacional, no padrón.</small></div> : null}</article>
      </div>
    </section>
    {electoralView ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle ?? undefined} /> : <V70ElectoralTerritoryUnavailable municipalityName="San José / Puerto San José" geoBundle={geoBundle ?? undefined} state="NO_PUBLICADO" />}
    <V70CanonicalRich0509 />
    <V70Ecosystem0509 />
  </>;
}

export function V70DirectIntelligence0509() { const { municipalityCode } = useParams(); const consumer = resolveRadarConsumer(municipalityCode); if (!consumer || municipalityCode !== "0509") return <Navigate to="/" replace />; return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="inteligencia" eyebrow="EXPEDIENTE MUNICIPAL 360" topbarTitle="San José / Puerto San José" accountRole="Cuenta del municipio" dayDNext><IntelligenceContent /></V70DirectShell0509></MunicipalityProvider>; }
