export interface ProfileMetric {
  label: string;
  value: string;
  detail: string;
}

export interface ProfileModule {
  id: string;
  title: string;
  summary: string;
  metrics: ProfileMetric[];
  status: "validated" | "partial" | "pending";
  source: string;
}

export interface MunicipalProfile {
  municipalityCode: string;
  controlStatus: string;
  lastUpdated: string;
  map?: {
    embedUrl: string;
    satelliteEmbedUrl?: string;
    populatedPlacesWithCoordinates: number;
    votingCenters: number;
    publicLayers?: Array<{ label: string; value: string; detail: string }>;
  };
  intelligence?: {
    populationProjection: string;
    voterRegister: string;
    voterWomen: string;
    voterMen: string;
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
    censusUrbanShare: number;
    censusRural: string;
    censusRuralShare: number;
    projectionMen: string;
    projectionWomen: string;
  };
  modules: ProfileModule[];
}

export const municipalProfiles: Record<string, MunicipalProfile> = {
  "0509": {
    municipalityCode: "0509",
    controlStatus: "CONTROL_VALIDADO",
    lastUpdated: "2026-08-17",
    map: {
      embedUrl: "https://www.openstreetmap.org/export/embed.html?bbox=-90.98%2C13.82%2C-90.68%2C14.04&layer=mapnik&marker=13.9256%2C-90.8244",
      satelliteEmbedUrl: "https://www.google.com/maps?q=13.9256,-90.8244&z=12&t=k&output=embed",
      populatedPlacesWithCoordinates: 81,
      votingCenters: 13,
      publicLayers: [
        { label: "Lugares poblados", value: "81", detail: "coordenadas validadas" },
        { label: "Centros de votación", value: "13", detail: "103 JRV auditadas" },
        { label: "Educación", value: "76", detail: "registros públicos" },
        { label: "Salud", value: "5", detail: "establecimientos públicos" },
        { label: "Obras", value: "Parcial", detail: "universos separados" },
      ],
    },
    intelligence: {
      populationProjection: "72,156",
      voterRegister: "40,890",
      voterWomen: "21,531",
      voterMen: "19,359",
      votingCenters: "13",
      votingBoards: "103",
      communityRecords: "205",
      territorialGroups: "9",
      registerCut: "12 julio 2026",
      registerGrowth: "+1,956",
      registerGrowthRate: "+5.0%",
      literacyRate: "89.9%",
      literatePeople: "36,775",
      womenLiteracy: "88.2%",
      menLiteracy: "91.9%",
      literacyUnregistered: "4,115",
      ages: [
        { label: "18–25", value: "6,585", share: 16.1 },
        { label: "26–30", value: "5,524", share: 13.51 },
        { label: "31–35", value: "5,369", share: 13.13 },
        { label: "36–40", value: "4,701", share: 11.5 },
        { label: "41–45", value: "3,928", share: 9.61 },
        { label: "46–50", value: "3,529", share: 8.63 },
        { label: "51–55", value: "2,967", share: 7.26 },
        { label: "56–60", value: "2,392", share: 5.85 },
        { label: "61–65", value: "2,049", share: 5.01 },
        { label: "66–70", value: "1,485", share: 3.63 },
        { label: "70+", value: "2,361", share: 5.77 },
      ],
      censusPopulation: "62,801",
      censusUrban: "23,887",
      censusUrbanShare: 38.04,
      censusRural: "38,914",
      censusRuralShare: 61.96,
      projectionMen: "36,896",
      projectionWomen: "35,260",
    },
    modules: [
      {
        id: "demografia",
        title: "Demografía",
        summary: "Población censada y proyección municipal, conservando separados los períodos.",
        status: "validated",
        source: "INE · Censo 2018 y proyecciones municipales",
        metrics: [
          { label: "Censo 2018", value: "62,801", detail: "habitantes" },
          { label: "Proyección 2026", value: "72,156", detail: "habitantes" },
        ],
      },
      {
        id: "electoral",
        title: "Electoral",
        summary: "Padrón, centros y juntas receptoras conectados al expediente territorial.",
        status: "validated",
        source: "TSE · Memoria electoral y padrón 2026",
        metrics: [
          { label: "Padrón 2026", value: "40,890", detail: "21,531 mujeres · 19,359 hombres" },
          { label: "Crecimiento", value: "+5.02%", detail: "+1,956 electores frente a 2023" },
          { label: "Centros", value: "13", detail: "centros confirmados" },
          { label: "JRV", value: "103", detail: "juntas receptoras de votos" },
        ],
      },
      {
        id: "territorio",
        title: "Territorio",
        summary: "Estructura municipal y lugares poblados con trazabilidad geográfica.",
        status: "validated",
        source: "INE · Lugares poblados; SEGEPLAN · PDM-OT",
        metrics: [
          { label: "Lugares poblados", value: "82", detail: "81 con coordenadas · 1 pendiente" },
          { label: "Microrregiones", value: "4", detail: "estructura PDM-OT" },
          { label: "Centralidades", value: "5", detail: "centralidades identificadas" },
          { label: "COCODES", value: "20 + 25", detail: "primer y segundo nivel" },
        ],
      },
      {
        id: "educacion",
        title: "Educación",
        summary: "Directorio geoespacial de establecimientos educativos.",
        status: "validated",
        source: "SEGEPLAN / MINEDUC",
        metrics: [{ label: "Establecimientos", value: "76", detail: "registros geoespaciales" }],
      },
      {
        id: "salud",
        title: "Salud",
        summary: "Inventario territorial de la red pública disponible.",
        status: "validated",
        source: "MSPAS · Directorio de establecimientos",
        metrics: [{ label: "Establecimientos", value: "5", detail: "registros municipales" }],
      },
      {
        id: "finanzas",
        title: "Finanzas",
        summary: "Series municipales preservadas por ejercicio y corte.",
        status: "partial",
        source: "MINFIN · Ejecución presupuestaria municipal",
        metrics: [
          { label: "Ingresos", value: "2016–2025", detail: "serie disponible" },
          { label: "Egresos", value: "2016–2023", detail: "serie comparable" },
          { label: "2026", value: "YTD", detail: "corte separado; no comparable como año completo" },
        ],
      },
      {
        id: "obras",
        title: "Obras",
        summary: "Universos municipales y SNIP separados para evitar dobles conteos.",
        status: "partial",
        source: "Municipalidad / SNIP / SEGEPLAN",
        metrics: [
          { label: "Municipales", value: "7", detail: "obras identificadas" },
          { label: "SNIP", value: "20", detail: "proyectos; universo separado" },
        ],
      },
      {
        id: "fuentes",
        title: "Fuentes y trazabilidad",
        summary: "Estado de validación, cortes y brechas del expediente.",
        status: "validated",
        source: "RADAR Data Vault · control municipal 0509",
        metrics: [
          { label: "Estado", value: "CONTROL_VALIDADO", detail: "estructura y reglas verificadas" },
          { label: "Memorias", value: "4", detail: "2011 · 2015 · 2019 · 2023" },
        ],
      },
    ],
  },
};

export const findMunicipalProfile = (municipalityCode?: string) =>
  municipalityCode ? municipalProfiles[municipalityCode] : undefined;
