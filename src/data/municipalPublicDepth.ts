/** Public, municipality-bound evidence recovered from validated Vault products. */
type Provenance = { source_id: string; product_id: string; product_url: string; readable_export_sha256: string };
export type MunicipalPoverty = Provenance & {
  municipality_code: string; period: number; status: "VALIDATED_MODELED_ESTIMATE";
  general_pct: number; extreme_pct: number | null; general_population: number;
  extreme_population: number | null; gap_pct: number; consumption_per_capita_month_gtq: number;
  national_rank: number;
};
export type PlanningPriority = Provenance & {
  municipality_code: string; kind: "PROBLEMA" | "POTENCIALIDAD";
  label: string; pdf_page: number; status: "SOURCE_VERIFIED";
};
export type PlanningIndicator = Provenance & {
  municipality_code: string; id: string; theme: string; label: string;
  baseline: number | null; baseline_unit: string; baseline_year: number | null;
  target: number | null; target_unit: string; target_year: number | null;
  reference: string; status: "VALIDATED_PDM_BASELINE"; note: string;
};
export type MunicipalPlanning = {
  municipality_code: string; catalog_product_id: string;
  review_status: "PENDING_SEMANTIC_REVIEW" | "NO_DOCUMENT_IN_INVENTORY" | "PARTIAL_VALIDATED_CONTENT";
  document: {
    file_id: string | null; file_name: string | null; url: string | null;
    publication_year: number | null; plan_start: number | null; plan_end: number | null;
    horizon_status: string; source_qa: string; source_observation: string | null;
    coverage_status: string;
  };
  priorities: PlanningPriority[]; indicators: PlanningIndicator[];
};
export type MunicipalPublicDepth = { municipality_code: string; poverty: MunicipalPoverty | null; planning: MunicipalPlanning | null };

const object = (value: unknown): Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown): value is string => typeof value === "string" && value.trim().length > 0;
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nonnegative = (value: unknown) => number(value) && value >= 0;
const nullableNumber = (value: unknown) => value === null || number(value);
const percent = (value: unknown) => number(value) && value >= 0 && value <= 100;
const year = (value: unknown) => value === null || (number(value) && Number.isInteger(value) && value >= 1900 && value <= 2100);
const provenance = (row: Record<string, unknown>) => text(row.source_id) && text(row.product_id)
  && typeof row.product_url === "string" && /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[\w-]+\/edit$/.test(row.product_url)
  && typeof row.readable_export_sha256 === "string" && /^[a-f0-9]{64}$/.test(row.readable_export_sha256);

export function municipalPublicDepth(value: unknown, code: string): MunicipalPublicDepth | null {
  const root = object(value);
  if (root.schema_version !== 1 || root.municipality_code !== code || !/^\d{4}$/.test(code)) return null;
  const p = object(root.poverty);
  const povertyValid = p.municipality_code === code && p.status === "VALIDATED_MODELED_ESTIMATE"
    && p.period === 2023 && provenance(p) && percent(p.general_pct)
    && (p.extreme_pct === null || (percent(p.extreme_pct) && (p.extreme_pct as number) <= (p.general_pct as number)))
    && nonnegative(p.general_population) && (p.extreme_population === null || nonnegative(p.extreme_population))
    && percent(p.gap_pct) && nonnegative(p.consumption_per_capita_month_gtq)
    && number(p.national_rank) && Number.isInteger(p.national_rank) && p.national_rank >= 1 && p.national_rank <= 340;
  const planning = object(root.planning);
  const document = object(planning.document);
  const priorities = Array.isArray(planning.priorities) ? planning.priorities : null;
  const indicators = Array.isArray(planning.indicators) ? planning.indicators : null;
  const documentValid = text(document.file_id) && /^[\w-]+$/.test(document.file_id)
    && document.url === `https://drive.google.com/file/d/${document.file_id}/view`
    && text(document.file_name) && document.file_name.startsWith(code);
  const missing = planning.review_status === "NO_DOCUMENT_IN_INVENTORY";
  const priorityValid = (value: unknown) => {
    const row = object(value);
    return row.municipality_code === code && row.source_id === `GT-SEGEPLAN-PDMOT-${code}-001`
      && row.status === "SOURCE_VERIFIED" && provenance(row) && text(row.label)
      && (row.kind === "PROBLEMA" || row.kind === "POTENCIALIDAD")
      && number(row.pdf_page) && Number.isInteger(row.pdf_page) && row.pdf_page > 0;
  };
  const indicatorValid = (value: unknown) => {
    const row = object(value);
    return row.municipality_code === code && row.source_id === `GT-SEGEPLAN-PDMOT-${code}-001`
      && row.status === "VALIDATED_PDM_BASELINE" && provenance(row) && text(row.id) && text(row.label)
      && text(row.theme) && text(row.baseline_unit) && text(row.target_unit) && text(row.note)
      && typeof row.reference === "string" && /^PDM p\. \d+(?:–\d+)?$/.test(row.reference)
      && nullableNumber(row.baseline) && nullableNumber(row.target) && year(row.baseline_year) && year(row.target_year);
  };
  const hasContent = Boolean(priorities?.length || indicators?.length);
  const planningValid = planning.municipality_code === code && text(planning.catalog_product_id)
    && text(document.source_qa) && (document.source_observation === null || text(document.source_observation)) && text(document.horizon_status)
    && year(document.publication_year) && year(document.plan_start) && year(document.plan_end)
    && priorities !== null && indicators !== null && priorities.every(priorityValid) && indicators.every(indicatorValid)
    && new Set(indicators.map((v) => object(v).id)).size === indicators.length
    && (missing ? document.file_id === null && document.url === null && !hasContent : documentValid)
    && (missing || planning.review_status === (hasContent ? "PARTIAL_VALIDATED_CONTENT" : "PENDING_SEMANTIC_REVIEW"));
  return { municipality_code: code, poverty: povertyValid ? p as MunicipalPoverty : null,
    planning: planningValid ? planning as MunicipalPlanning : null };
}
