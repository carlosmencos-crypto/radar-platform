import type { MunicipalEgm } from './municipalEgm';

export function municipalEgmReport(egm: MunicipalEgm | null) {
  if (!egm) return [];
  const sections = [];
  for (let i = 0; i < egm.indicators.length; i += 4) {
    sections.push({ key: 'indicators', eyebrow: 'INE · EGM 2024', title: `Registros administrativos · ${i / 4 + 1}`,
      text: `Municipio ${egm.municipality_code}. Conteos y valores originales; no son tasas ni cifras del padrón.`,
      items: egm.indicators.slice(i, i + 4).map(row => `${row.label}: ${row.value === null ? 'sin dato verificable' : `${row.value.toLocaleString('es-GT', { maximumFractionDigits: row.unit === 'Q' ? 2 : 0 })} ${row.unit}`}. ${row.source_table}${row.source_row !== null ? `, fila ${row.source_row}` : ''}. ${row.value === null ? row.note : ''}`) });
  }
  sections.push({ key: 'indicators', eyebrow: 'INE · EGM 2024 · TRAZABILIDAD', title: 'Fuente y límites de los registros', text: `${egm.source_id} · Hoja ${egm.source_sheet}`,
    items: [...egm.caveats, egm.product_url, egm.validation_url] });
  return sections;
}
