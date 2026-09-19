import { useCallback, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { getInstalledRadarElectoralLayers, getInstalledRadarGeoBundle } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectionCode, type V70ElectoralViewModel } from "../data/v70ElectoralAdapter";
import { buildMunicipalIntelligenceModel } from "../data/v70MunicipalIntelligence";
import { V70CanonicalRichMunicipality } from "./V70CanonicalRichMunicipality";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70Ecosystem0509 } from "./V70Ecosystem0509";
import { V70ElectoralTerritory } from "./V70ElectoralTerritory";
import { V70ElectoralTerritoryUnavailable } from "./V70ElectoralTerritoryUnavailable";

type ExportSelection = { electionCode?: V70ElectionCode; centerId?: string };
type AgeRow = { key: string; label: string; value: number; share: number };

const AGE_BANDS = [
  ["18_25", "18–25"], ["26_30", "26–30"], ["31_35", "31–35"],
  ["36_40", "36–40"], ["41_45", "41–45"], ["46_50", "46–50"],
  ["51_55", "51–55"], ["56_60", "56–60"], ["61_65", "61–65"],
  ["66_70", "66–70"], ["70_plus", "70+"],
] as const;

const integer = new Intl.NumberFormat("es-GT");

function numberFromText(value?: string) {
  if (!value) return null;
  const parsed = Number(value.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function canonicalAsset(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

function resolveViewModel(municipalityCode: string): V70ElectoralViewModel | null {
  const layers = getInstalledRadarElectoralLayers(municipalityCode) ?? [];
  if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null;
  try {
    return adaptAuthorizedElectoralTerritoryLayers(layers);
  } catch (error) {
    console.error("RADAR_V70_ELECTORAL_ADAPTER_FAIL_CLOSED", municipalityCode, error);
    return null;
  }
}

function cutoffLabel(value?: string, fallback = "2026") {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat("es-GT", {
    timeZone: "America/Guatemala",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function CanonicalUnavailable({ children }: { children: string }) {
  return <span className="canonical-inline-unavailable">{children}</span>;
}

function CanonicalMunicipalIntelligenceContent({ onSelectionChange }: { onSelectionChange: (selection: { electionCode: V70ElectionCode; centerId: string }) => void }) {
  const { runtime } = useAuthorizedRadarRuntime();
  const { municipality_code, municipality_name, department_name } = useMunicipalityContext();
  const electoralLayers = getInstalledRadarElectoralLayers(municipality_code) ?? [];
  const model = useMemo(
    () => buildMunicipalIntelligenceModel(runtime, electoralLayers),
    [runtime, electoralLayers],
  );
  const profile = findMunicipalProfile(municipality_code);
  const intelligence = profile?.intelligence;
  const activeProfile = runtime.elector_profile;
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);
  const electoralView = useMemo(() => resolveViewModel(municipality_code), [municipality_code]);

  const activeElectors = activeProfile?.total_active ?? model.activeElectors;
  const women = activeProfile?.women_active ?? model.women;
  const men = activeProfile?.men_active ?? model.men;
  const sexTotal = (women ?? 0) + (men ?? 0);
  const womenShare = women !== null && sexTotal > 0 ? women / sexTotal * 100 : null;
  const menShare = men !== null && sexTotal > 0 ? men / sexTotal * 100 : null;
  const sexGap = women !== null && men !== null ? Math.abs(women - men) : null;
  const registerGrowth = activeElectors !== null && model.registered2023 !== null
    ? activeElectors - model.registered2023
    : null;
  const registerGrowthRate = activeElectors !== null && model.registered2023
    ? registerGrowth! / model.registered2023 * 100
    : null;

  const activeAgeRows = useMemo<AgeRow[]>(() => {
    if (!activeProfile?.age_total || !activeProfile.total_active) return [];
    return AGE_BANDS.flatMap(([key, label]) => {
      const value = activeProfile.age_total?.[key];
      return typeof value === "number" && Number.isFinite(value)
        ? [{ key, label, value, share: value / activeProfile.total_active * 100 }]
        : [];
    });
  }, [activeProfile]);
  const fallbackAgeRows = useMemo<AgeRow[]>(() => (intelligence?.ages ?? []).flatMap((item) => {
    const value = numberFromText(item.value);
    return value === null ? [] : [{ key: item.label, label: item.label, value, share: item.share }];
  }), [intelligence]);
  const ageRows = activeAgeRows.length ? activeAgeRows : fallbackAgeRows;
  const maxAgeShare = Math.max(...ageRows.map((item) => item.share), 1);
  const ageUniverse = activeAgeRows.length ? "PADRÓN ACTIVO 2026" : "PADRÓN DETALLADO 2023 · UNIVERSO SEPARADO";
  const young = activeProfile?.age_total
    ? ["18_25", "26_30", "31_35", "36_40"].reduce((sum, key) => sum + (activeProfile.age_total?.[key] ?? 0), 0)
    : null;
  const youngShare = young !== null && activeProfile?.total_active
    ? young / activeProfile.total_active * 100
    : null;

  const womenLiterate = activeProfile?.women_literate ?? null;
  const womenIlliterate = activeProfile?.women_illiterate ?? null;
  const menLiterate = activeProfile?.men_literate ?? null;
  const menIlliterate = activeProfile?.men_illiterate ?? null;
  const literateTotal = womenLiterate !== null && menLiterate !== null ? womenLiterate + menLiterate : null;
  const illiterateTotal = womenIlliterate !== null && menIlliterate !== null
    ? womenIlliterate + menIlliterate
    : activeElectors !== null && model.literacyShare !== null
      ? Math.max(0, Math.round(activeElectors * (1 - model.literacyShare)))
      : null;
  const literacyShare = activeElectors && literateTotal !== null
    ? literateTotal / activeElectors
    : model.literacyShare;
  const womenLiteracyShare = women && womenLiterate !== null ? womenLiterate / women : null;
  const menLiteracyShare = men && menLiterate !== null ? menLiterate / men : null;

  const censusPopulation = numberFromText(intelligence?.censusPopulation);
  const censusUrban = numberFromText(intelligence?.censusUrban);
  const censusRural = numberFromText(intelligence?.censusRural);
  const projection = model.population ?? numberFromText(intelligence?.populationProjection);
  const projectionMen = model.populationMen ?? numberFromText(intelligence?.projectionMen);
  const projectionWomen = model.populationWomen ?? numberFromText(intelligence?.projectionWomen);

  return <>
    <div className="print-cover"><div className="radar-brand compact"><img src={canonicalAsset("/brand/radar-electoral-logo-reducido-horizontal-claro.svg")} alt="RADAR Electoral" /></div><div><b>{municipality_name} · {municipality_code}</b><span>{department_name} · expediente municipal autorizado</span></div></div>
    <section className="section-banner"><div className="section-banner-copy"><p>EXPEDIENTE MUNICIPAL 360 · {department_name.toUpperCase()} — {municipality_name.toUpperCase()}</p><h1>Inteligencia Municipal</h1><span>Fotografía estratégica del municipio para definir mensajes y prioridades</span></div></section>
    <section className="kpis" aria-label="Indicadores principales">
      <article><small>Población proyectada {model.projectionYear ?? 2026}</small><b>{projection === null ? "—" : integer.format(projection)}</b><em>{runtime.demographics?.source_label ?? "INE · no publicado"}</em></article>
      <article><small>Padrón electoral activo 2026</small><b>{activeElectors === null ? "—" : integer.format(activeElectors)}</b><em>{women === null || men === null ? "TSE · desglose no publicado" : `${integer.format(women)} mujeres · ${integer.format(men)} hombres`}</em></article>
      <article><small>Centros electorales geolocalizados</small><b>{model.centers === null ? "—" : integer.format(model.centers)} <i>centros</i></b><em>{model.jrv === null ? "JRV no publicadas" : `${integer.format(model.jrv)} JRV`} · TREP 2023</em></article>
      <article><small>ORGANIZACIÓN COMUNITARIA TSE</small><b>{model.communities === null ? "—" : integer.format(model.communities)} <i>registros</i></b><em>{model.territorialGroups === null ? "Agrupaciones no publicadas" : `${integer.format(model.territorialGroups)} agrupaciones territoriales del municipio`}</em></article>
    </section>
    <section className="section electorate-profile" data-v70-contract="electorate-profile-v70">
      <div className="section-head"><div><p className="eyebrow">PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026</p><h2>Quiénes pueden votar hoy</h2></div><p>Sexo, edad y alfabetismo conservan el período y universo publicado por el TSE. La población y las proyecciones del INE se muestran aparte para no mezclar universos.</p></div>
      <div className="electorate-hero">
        <article className="register-total"><span>PADRÓN ACTIVO</span><b>{activeElectors === null ? "—" : integer.format(activeElectors)}</b><p>Corte oficial: {cutoffLabel(activeProfile?.cutoff_at, intelligence?.registerCut)}</p>{registerGrowth !== null ? <div><strong>{registerGrowth >= 0 ? "+" : ""}{integer.format(registerGrowth)}</strong><small>personas frente al padrón electoral 2023<br />comparación indicativa{registerGrowthRate === null ? "" : `: ${registerGrowthRate >= 0 ? "+" : ""}${registerGrowthRate.toFixed(1)}%`}</small></div> : <CanonicalUnavailable>Comparación 2023 no publicada</CanonicalUnavailable>}</article>
        <article className="sex-profile"><div className="profile-title"><span>COMPOSICIÓN POR SEXO</span><b>{sexGap === null ? "No publicado" : `Brecha: ${integer.format(sexGap)}`}</b></div>{women !== null && men !== null && womenShare !== null && menShare !== null ? <><div className="split-meter"><i style={{ width: `${womenShare}%` }} /><em style={{ width: `${menShare}%` }} /></div><div className="split-labels"><span><i />Mujeres <b>{integer.format(women)}</b><small>{womenShare.toFixed(1)}%</small></span><span><i />Hombres <b>{integer.format(men)}</b><small>{menShare.toFixed(1)}%</small></span></div></> : <CanonicalUnavailable>Desglose por sexo no publicado para este corte</CanonicalUnavailable>}</article>
        <article className="literacy-profile"><div><span>ALFABETISMO REGISTRADO</span><b>{literacyShare === null ? "No publicado" : `${(literacyShare * 100).toFixed(1)}%`}</b><small>{literateTotal === null ? "TSE · padrón activo 2026" : `${integer.format(literateTotal)} personas`}</small></div><div className="literacy-detail"><span>Mujeres <b>{womenLiteracyShare === null ? "No publicado" : `${(womenLiteracyShare * 100).toFixed(1)}%`}</b></span><span>Hombres <b>{menLiteracyShare === null ? "No publicado" : `${(menLiteracyShare * 100).toFixed(1)}%`}</b></span><span>Sin alfabetismo registrado <b>{illiterateTotal === null ? "No publicado" : integer.format(illiterateTotal)}</b></span></div></article>
      </div>
      <div className="age-and-territory">
        <article className="age-profile"><div className="profile-title"><span>ESTRUCTURA POR EDAD</span><b>{youngShare === null ? ageUniverse : `${youngShare.toFixed(1)}% tiene entre 18 y 40 años`}</b></div>{ageRows.length ? <div className="age-bars">{ageRows.map((item) => <div key={item.key}><span>{item.label}</span><i><em style={{ width: `${item.share / maxAgeShare * 100}%` }} /></i><b>{integer.format(item.value)}</b><small>{item.share.toFixed(1)}%</small></div>)}</div> : <div className="canonical-vault-notice compact"><span>NO PUBLICADO</span><h3>Distribución por edad pendiente</h3><p>La tarjeta se conserva sin estimar grupos etarios.</p></div>}</article>
        <article className="universe-card"><div className="profile-title"><span>POBLACIÓN Y TERRITORIO</span><b>Universos separados</b></div><div className="universe-block current"><span>TSE · PADRÓN 2026</span><b>{activeElectors === null ? "No publicado" : integer.format(activeElectors)}</b><small>Ciudadanos empadronados activos. La fuente actual no publica urbano/rural.</small></div><div className="universe-block census"><span>INE · CENSO 2018</span><b>{censusPopulation === null ? "No publicado" : integer.format(censusPopulation)}</b>{censusPopulation !== null && censusUrban !== null && censusRural !== null ? <><div className="rural-bar"><i style={{ width: `${intelligence?.censusUrbanShare ?? 0}%` }} /><em style={{ width: `${intelligence?.censusRuralShare ?? 0}%` }} /></div><p><strong>{integer.format(censusUrban)} urbanos · {(intelligence?.censusUrbanShare ?? 0).toFixed(1)}%</strong><strong>{integer.format(censusRural)} rurales · {(intelligence?.censusRuralShare ?? 0).toFixed(1)}%</strong></p></> : <small>La desagregación urbana/rural no está publicada en el contrato municipal actual.</small>}</div><div className="universe-block projection"><span>INE · PROYECCIÓN {model.projectionYear ?? 2026}</span><b>{projection === null ? "No publicado" : integer.format(projection)}</b><small>{projectionMen === null || projectionWomen === null ? "Proyección poblacional; desglose por sexo no publicado." : `${integer.format(projectionMen)} hombres · ${integer.format(projectionWomen)} mujeres. Proyección poblacional, no padrón.`}</small></div></article>
      </div>
      <p className="trace-note">Fuentes: TSE · padrón activo 2026 y padrón detallado 2023; INE · Censo 2018 y proyecciones municipales. Un vacío permanece visible y nunca se rellena ni se mezcla con otro universo.</p>
    </section>
    {electoralView ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle ?? undefined} onSelectionChange={onSelectionChange} /> : <V70ElectoralTerritoryUnavailable municipalityName={municipality_name} geoBundle={geoBundle ?? undefined} state="NO_PUBLICADO" />}
    <V70CanonicalRichMunicipality />
    <V70Ecosystem0509 />
  </>;
}

export function V70DirectIntelligence0509() {
  const { municipalityCode } = useParams();
  const [exportSelection, setExportSelection] = useState<ExportSelection>({});
  const handleSelectionChange = useCallback((selection: { electionCode: V70ElectionCode; centerId: string }) => setExportSelection(selection), []);
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || !municipalityCode) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="inteligencia" eyebrow="EXPEDIENTE MUNICIPAL 360" topbarTitle={municipalityTitle} accountRole="Cuenta del municipio" dayDNext intelligenceExportSelection={exportSelection}><CanonicalMunicipalIntelligenceContent onSelectionChange={handleSelectionChange} /></V70DirectShell0509></MunicipalityProvider>;
}
