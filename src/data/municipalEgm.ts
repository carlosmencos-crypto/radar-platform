export type EgmIndicator = { code: string; label: string; unit: string; value: number | null; status: string; source_table: string; source_row: number | null; note: string };
export type MunicipalEgm = { schema_version: 1; municipality_code: string; year: 2024; product_url: string; validation_url: string; readable_export_sha256: string; source_id: string; source_file: string; source_sheet: string; indicators: EgmIndicator[]; caveats: string[] };
const statuses = new Set(['VALIDATED', 'SOURCE_BLANK', 'SOURCE_REPORTS_NO_RECORD', 'SOURCE_TABLE_ABSENT', 'SOURCE_WRONG_MUNICIPALITY_LABEL']);
const obj = (v: unknown): Record<string, unknown> => v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
const nonempty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

export function municipalEgm(value: unknown, code: string): MunicipalEgm | null {
  const root = obj(value);
  if (!/^\d{4}$/.test(code) || root.municipality_code !== code || root.schema_version !== 1 || root.year !== 2024
    || root.source_id !== `GT-INE-EGM-2024-${code.slice(0, 2)}-XLSX-001`
    || typeof root.source_file !== 'string' || !root.source_file.startsWith(`GT_INE_2024_EGM_${code.slice(0, 2)}_`)
    || !nonempty(root.source_sheet) || typeof root.readable_export_sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(root.readable_export_sha256)
    || root.product_url !== 'https://docs.google.com/spreadsheets/d/1R1oecrZn0YbySHTB2hepoMlj5PHV02uA/edit'
    || root.validation_url !== 'https://docs.google.com/spreadsheets/d/1cwnk1V4CfLhC-d7ruu8OpGcvTIyPFrST/edit'
    || !Array.isArray(root.caveats) || !root.caveats.every(nonempty)
    || !Array.isArray(root.indicators) || root.indicators.length !== 23) return null;
  const rows = root.indicators.map(obj);
  if (new Set(rows.map(r => r.code)).size !== 23 || !rows.every(r => nonempty(r.code) && nonempty(r.label) && nonempty(r.unit)
    && nonempty(r.source_table) && nonempty(r.note) && typeof r.status === 'string' && statuses.has(r.status)
    && (r.source_row === null || (typeof r.source_row === 'number' && Number.isInteger(r.source_row) && r.source_row > 0))
    && (r.status === 'VALIDATED' ? typeof r.value === 'number' && Number.isFinite(r.value) && r.value >= 0 && r.source_row !== null : r.value === null))) return null;
  return root as MunicipalEgm;
}
