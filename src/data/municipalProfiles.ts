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
    populatedPlacesWithCoordinates: number;
    votingCenters: number;
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
      populatedPlacesWithCoordinates: 81,
      votingCenters: 13,
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
