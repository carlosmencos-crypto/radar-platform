export type EmptyStateCopyKey =
  | "not_published"
  | "no_explicit_association"
  | "no_record_in_source";

export type EmptyStateLayerId =
  | "PDM_PDMOT"
  | "GUATECOMPRAS"
  | "CONAP_SIGAP"
  | "MSPAS_SALUD";

export interface MunicipalityEmptyState {
  layerId: EmptyStateLayerId;
  layerLabel: string;
  copyKey: EmptyStateCopyKey;
  badge: "NO PUBLICADO" | "VACÍO EXPLÍCITO";
  title: string;
  description: string;
  guardrail: string;
}

const emptyStateCatalog: Record<EmptyStateLayerId, Omit<MunicipalityEmptyState, "layerId">> = {
  PDM_PDMOT: {
    layerLabel: "Catálogo PDM/PDM-OT",
    copyKey: "not_published",
    badge: "NO PUBLICADO",
    title: "Documento no localizado en el inventario oficial",
    description: "El módulo permanece visible para documentar la brecha. No se interpreta como error de ruta ni como ausencia de planificación municipal.",
    guardrail: "El catálogo no valida contenido interno de los PDF.",
  },
  GUATECOMPRAS: {
    layerLabel: "Contratos Guatecompras",
    copyKey: "not_published",
    badge: "NO PUBLICADO",
    title: "Sin contratos publicados en la fuente consultada",
    description: "Este estado no equivale a cero compras, cero obras ni ausencia de procesos en otros universos.",
    guardrail: "No inferir vínculo con SNIP ni ejecución física.",
  },
  CONAP_SIGAP: {
    layerLabel: "Áreas protegidas CONAP",
    copyKey: "no_explicit_association",
    badge: "VACÍO EXPLÍCITO",
    title: "Sin asociación municipal explícita en la fuente",
    description: "La fuente no vincula explícitamente este municipio con un área protegida. No se convierte esa ausencia en cero.",
    guardrail: "No repartir hectáreas ni inferir presencia territorial.",
  },
  MSPAS_SALUD: {
    layerLabel: "Establecimientos de salud MSPAS",
    copyKey: "no_record_in_source",
    badge: "VACÍO EXPLÍCITO",
    title: "Sin registro en el universo MSPAS consultado",
    description: "No equivale a inexistencia de servicios de salud. El módulo conserva la ausencia tal como aparece en la fuente.",
    guardrail: "No imputar establecimientos ni mezclar fuentes equivalentes con el universo MSPAS.",
  },
};

const municipalityCodesByLayer: Record<EmptyStateLayerId, readonly string[]> = {
  PDM_PDMOT: ["0101","0115","0116","0201","1333"],
  GUATECOMPRAS: ["0302","0611","0704","0713","0716","0921","1008","1021","1229","1311","1316","1412","1616","1906","2211"],
  CONAP_SIGAP: ["0102","0103","0104","0107","0110","0111","0112","0113","0117","0201","0204","0206","0207","0208","0302","0305","0309","0310","0315","0402","0403","0404","0405","0410","0413","0415","0502","0503","0505","0506","0508","0510","0513","0514","0601","0603","0604","0605","0606","0607","0701","0702","0703","0708","0710","0711","0712","0714","0715","0802","0803","0804","0806","0807","0808","0902","0903","0905","0906","0907","0908","0910","0913","0914","0915","0918","0920","0921","0922","0924","1001","1002","1004","1005","1006","1007","1008","1009","1010","1011","1012","1016","1017","1018","1020","1021","1102","1103","1104","1106","1204","1205","1206","1210","1214","1215","1216","1217","1221","1222","1223","1224","1226","1228","1229","1230","1301","1303","1304","1306","1309","1310","1311","1312","1313","1317","1319","1320","1322","1324","1325","1327","1328","1329","1330","1333","1401","1402","1404","1406","1407","1408","1409","1410","1411","1412","1414","1416","1417","1418","1419","1421","1503","1505","1506","1602","1604","1607","1608","1612","1613","1615","1616","1617","1714","1902","1906","1908","1910","1911","2001","2002","2003","2004","2005","2006","2010","2103","2104","2107","2206","2209","2210","2211","2212","2213","2215","2216"],
  MSPAS_SALUD: ["1217"],
};

const layerOrder: EmptyStateLayerId[] = [
  "PDM_PDMOT",
  "GUATECOMPRAS",
  "CONAP_SIGAP",
  "MSPAS_SALUD",
];

export const findMunicipalityEmptyStates = (
  municipalityCode?: string,
): MunicipalityEmptyState[] => {
  if (!municipalityCode) return [];

  return layerOrder
    .filter((layerId) => municipalityCodesByLayer[layerId].includes(municipalityCode))
    .map((layerId) => ({ layerId, ...emptyStateCatalog[layerId] }));
};
