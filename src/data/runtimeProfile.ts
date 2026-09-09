import { getLayer } from "./radarConsumer";
import type { RadarMunicipalConsumer } from "../types/radar";

export interface RuntimeIntelligence {
  populationProjection: string;
  voterRegister: string;
  voterWomen: string;
  voterMen: string;
  voterWomenShare: number | null;
  voterMenShare: number | null;
  voterWomenShareLabel: string;
  voterMenShareLabel: string;
  votingCenters: string;
  votingBoards: string;
  communityRecords: string;
  territorialGroups: string;
  registerCut: string;
  registerGrowth: string;
  registerGrowthRate: string;
  literacyRate: string;
  literatePeople: string;
  womenLiteracy: string;
  menLiteracy: string;
  literacyUnregistered: string;
  ages: Array<{ label: string; value: string; share: number }>;
  censusPopulation: string;
  censusUrban: string;
  censusUrbanShare: number | null;
  censusRural: string;
  censusRuralShare: number | null;
  projectionMen: string;
  projectionWomen: string;
}

export interface RuntimeProfile {
  intelligence?: RuntimeIntelligence;
  map?: {
    embedUrl?: string;
    satelliteEmbedUrl?: string;
    populatedPlacesWithCoordinates: number | null;
    publicLayers: Array<{ label: string; value: string; detail: string }>;
  };
}

const unavailable = "No publicado";
const numberFormat = new Intl.NumberFormat("es-GT", { maximumFractionDigits: 1 });

function numberValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function textValue(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  const numeric = numberValue(value);
  return numeric === null ? unavailable : numberFormat.format(numeric);
}

function percentValue(value: unknown): string {
  const numeric = numberValue(value);
  return numeric === null ? unavailable : `${numberFormat.format(numeric)}%`;
}

export function buildRuntimeProfile(consumer: RadarMunicipalConsumer): RuntimeProfile {
  const electoral = getLayer(consumer, "NUCLEO_ELECTORAL")?.payload;
  const census = getLayer(consumer, "INE_CENSO_B2_B6")?.payload;
  const geo = getLayer(consumer, "TSE_CENTROS_GEO")?.payload;
  const education = getLayer(consumer, "MINEDUC_ESCUELAS")?.payload;
  const health = getLayer(consumer, "MSPAS_SALUD")?.payload;

  const voterRegister = numberValue(electoral?.registered_voters);
  const women = numberValue(electoral?.women);
  const men = numberValue(electoral?.men);
  const censusPopulation = numberValue(census?.population);
  const urbanShare = numberValue(census?.urban_pct);
  const ruralShare = numberValue(census?.rural_pct);
  const projection = numberValue(electoral?.population) ?? censusPopulation;
  const projectionMen = projection !== null && men !== null && voterRegister
    ? Math.round(projection * men / voterRegister)
    : null;
  const projectionWomen = projection !== null && women !== null && voterRegister
    ? Math.round(projection * women / voterRegister)
    : null;
  const womenShare = women !== null && voterRegister ? women / voterRegister * 100 : null;
  const menShare = men !== null && voterRegister ? men / voterRegister * 100 : null;
  const ageRows = [
    ["18–29", census?.age_18_29_pct],
    ["30–59", census?.age_30_59_pct],
    ["60+", census?.age_60_plus_pct],
  ] as const;
  const ages = ageRows.flatMap(([label, value]) => {
    const share = numberValue(value);
    if (share === null) return [];
    return [{ label, share, value: voterRegister === null ? unavailable : numberFormat.format(Math.round(voterRegister * share / 100)) }];
  });

  const intelligence = electoral || census ? {
    populationProjection: textValue(projection),
    voterRegister: textValue(voterRegister),
    voterWomen: textValue(women),
    voterMen: textValue(men),
    voterWomenShare: womenShare,
    voterMenShare: menShare,
    voterWomenShareLabel: womenShare === null ? unavailable : percentValue(womenShare),
    voterMenShareLabel: menShare === null ? unavailable : percentValue(menShare),
    votingCenters: textValue(electoral?.voting_centers ?? geo?.centers),
    votingBoards: textValue(electoral?.jrv ?? geo?.jrv),
    communityRecords: textValue(electoral?.communities),
    territorialGroups: unavailable,
    registerCut: getLayer(consumer, "NUCLEO_ELECTORAL")?.period ?? unavailable,
    registerGrowth: unavailable,
    registerGrowthRate: unavailable,
    literacyRate: unavailable,
    literatePeople: unavailable,
    womenLiteracy: unavailable,
    menLiteracy: unavailable,
    literacyUnregistered: unavailable,
    ages,
    censusPopulation: textValue(censusPopulation),
    censusUrban: urbanShare === null || censusPopulation === null ? unavailable : numberFormat.format(Math.round(censusPopulation * urbanShare / 100)),
    censusUrbanShare: urbanShare,
    censusRural: ruralShare === null || censusPopulation === null ? unavailable : numberFormat.format(Math.round(censusPopulation * ruralShare / 100)),
    censusRuralShare: ruralShare,
    projectionMen: textValue(projectionMen),
    projectionWomen: textValue(projectionWomen),
  } satisfies RuntimeIntelligence : undefined;

  const publicLayers = [
    ["Centros de votación", geo?.centers ?? electoral?.voting_centers, "Data Vault · sesión autorizada"],
    ["Educación", education?.schools, "establecimientos"],
    ["Salud", health?.facilities, "establecimientos"],
  ].flatMap(([label, value, detail]) => value === undefined || value === null ? [] : [{ label: String(label), value: textValue(value), detail: String(detail) }]);

  const map = geo ? {
    embedUrl: typeof geo.embed_url === "string" ? geo.embed_url : undefined,
    satelliteEmbedUrl: typeof geo.satellite_embed_url === "string" ? geo.satellite_embed_url : undefined,
    populatedPlacesWithCoordinates: numberValue(geo.centers),
    publicLayers,
  } : undefined;

  return { intelligence, map };
}
