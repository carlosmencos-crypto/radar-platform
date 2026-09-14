import { useMemo } from "react";
import { Navigate, useParams } from "react-router-dom";
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

function numberFromText(value?: string) {
  if (!value) return undefined;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function resolveViewModel(): V70ElectoralViewModel | null {
  const layers = getInstalledRadarElectoralLayers("0509") ?? [];
  if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null;
  try {
    return adaptAuthorizedElectoralTerritoryLayers(layers);
  } catch (error) {
    console.error("RADAR_V70_ELECTORAL_ADAPTER_FAIL_CLOSED", "0509", error);
    return null;
  }
}

function IntelligenceContent() {
  const profile = findMunicipalProfile("0509");
  const intelligence = profile?.intelligence;
  const geoBundle = getInstalledRadarGeoBundle("0509");
  const electoralView = useMemo(() => resolveViewModel(), []);
  const women = numberFromText(intelligence?.voterWomen);
  const men = numberFromText(intelligence?.voterMen);
  const sexTotal = (women ?? 0) + (men ?? 0);
  const womenShare = sexTotal > 0 && women !== undefined ? women / sexTotal * 100 : 0;
  const menShare = sexTotal > 0 && men !== undefined ? men / sexTotal * 100 : 0;
  const sexGap = women !== undefined && men !== undefined ? Math.abs(women - men) : undefined;
  const maxAgeShare = Math.max(...(intelligence?.ages.map((item) => item.share) ?? [1]), 1);

  if (!intelligence) {
    return <section className="section"><div className="canonical-vault-notice"><span>NO_PUBLICADO</span><h3>Expediente municipal no disponible</h3><p>RADAR mantiene el vacío sin imputar datos.</p></div></section>;
  }

  return <>
    <section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — SAN JOSÉ / PUERTO SAN JOSÉ</p><h1>Inteligencia Municipal</h1><span>Fotografía estratégica del municipio para definir mensajes y prioridades</span></div></section>
    <section className="kpis" aria-label="Indicadores principales">
      <article><small>Población proyectada 2026</small><b>{intelligence.populationProjection || "—"}</b><em>INE · proyección oficial al 30 de junio</em></article>
      <article><small>Padrón electoral activo 2026</small><b>{intelligence.voterRegister}</b><em>{intelligence.voterWomen ? `${intelligence.voterWomen} mujeres` : "TSE"}{intelligence.voterMen ? ` · ${intelligence.voterMen} hombres` : ""}</em></article>
      <article><small>Centros electorales geolocalizados</small><b>{intelligence.votingCenters || "—"} <i>centros</i></b><em>{intelligence.votingBoards ? `${intelligence.votingBoards} JRV · ` : ""}TSE 2023</em></article>
      <article><small>Organización territorial</small><b>{intelligence.communityRecords || "—"} <i>comunidades</i></b><em>{intelligence.territorialGroups ? `${intelligence.territorialGroups} agrupaciones territoriales` : "Núcleo electoral municipal"}</em></article>
    </section>

    <section className="section electorate-profile">
      <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO</p><h2>Quiénes pueden votar hoy</h2></div><p>RADAR mantiene separados padrón activo, padrón detallado, Censo y proyecciones para evitar cruces de universos incompatibles.</p></div>
      <div className="electorate-hero">
        <article className="register-total"><span>PADRÓN ACTIVO 2026</span><b>{intelligence.voterRegister}</b><p>Corte oficial: {intelligence.registerCut || "2026"}</p>{intelligence.registerGrowth ? <div><strong>{intelligence.registerGrowth}</strong><small>personas frente al padrón oficial 2023<br />variación: {intelligence.registerGrowthRate}</small></div> : null}</article>
        {women !== undefined && men !== undefined ? <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span>{sexGap !== undefined ? <b>Brecha: {new Intl.NumberFormat("es-GT").format(sexGap)}</b> : null}</div><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{intelligence.voterWomen}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{intelligence.voterMen}</b><small>{menShare.toFixed(1)}%</small></span></div></article> : null}
        {intelligence.literacyRate ? <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{intelligence.literacyRate}</b>{intelligence.literatePeople ? <small>{intelligence.literatePeople} personas</small> : null}</div><div className="literacy-detail">{intelligence.womenLiteracy ? <span>Mujeres <b>{intelligence.womenLiteracy}</b></span> : null}{intelligence.menLiteracy ? <span>Hombres <b>{intelligence.menLiteracy}</b></span> : null}{intelligence.literacyUnregistered ? <span>Sin alfabetismo registrado <b>{intelligence.literacyUnregistered}</b></span> : null}</div></article> : null}
      </div>
      <div className="age-and-territory">
        {intelligence.ages.length ? <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>Padrón detallado · universo separado</b></div><div className="age-bars">{intelligence.ages.map((item) => <div key={item.label}><span>{item.label}</span><i><em style={{ width: `${item.share / maxAgeShare * 100}%` }} /></i><b>{item.value}</b><small>{item.share.toFixed(1)}%</small></div>)}</div></article> : null}
        <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{intelligence.voterRegister}</b><small>Ciudadanos empadronados activos.</small></div>{intelligence.censusPopulation ? <div className="universe-block census"><span>INE · CENSO 2018</span><b>{intelligence.censusPopulation}</b><div className="rural-bar"><i style={{ width: `${intelligence.censusUrbanShare}%` }} /><em style={{ width: `${intelligence.censusRuralShare}%` }} /></div><p><strong>{intelligence.censusUrban} urbanos · {intelligence.censusUrbanShare.toFixed(1)}%</strong><strong>{intelligence.censusRural} rurales · {intelligence.censusRuralShare.toFixed(1)}%</strong></p></div> : null}{intelligence.populationProjection ? <div className="universe-block projection"><span>INE · PROYECCIÓN 2026</span><b>{intelligence.populationProjection}</b><small>{intelligence.projectionMen ? `${intelligence.projectionMen} hombres` : ""}{intelligence.projectionMen && intelligence.projectionWomen ? " · " : ""}{intelligence.projectionWomen ? `${intelligence.projectionWomen} mujeres` : ""}. Proyección poblacional, no padrón.</small></div> : null}</article>
      </div>
    </section>

    {electoralView
      ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle ?? undefined} />
      : <V70ElectoralTerritoryUnavailable municipalityName="San José / Puerto San José" geoBundle={geoBundle ?? undefined} state="NO_PUBLICADO" />}
    <V70CanonicalRich0509 />
    <V70Ecosystem0509 />
  </>;
}

export function V70DirectIntelligence0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509") return <Navigate to="/" replace />;
  return <MunicipalityProvider consumer={consumer}>
    <V70DirectShell0509 active="inteligencia" eyebrow="EXPEDIENTE MUNICIPAL 360" topbarTitle="San José / Puerto San José" accountRole="Cuenta del municipio" dayDNext>
      <IntelligenceContent />
    </V70DirectShell0509>
  </MunicipalityProvider>;
}
