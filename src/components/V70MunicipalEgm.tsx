import { municipalEgm } from '../data/municipalEgm';
import { formatCurrency, formatInteger } from '../data/v70MunicipalIntelligence';

const securityCodes = ['HOMICIDIOS_VICTIMAS_TOTAL', 'VIF_VICTIMAS_TOTAL', 'VCM_MUJERES_AGRAVIADAS_TOTAL', 'FALTAS_JUDICIALES_TOTAL', 'TRANSITO_AFECTADOS_TOTAL'];
const labels = ['Víctimas de homicidio', 'Víctimas de violencia intrafamiliar', 'Mujeres agraviadas · Decreto 22-2008', 'Faltas judiciales', 'Personas afectadas en tránsito'];
export function V70MunicipalEgm({ value, code, heading }: { value: unknown; code: string; heading: string }) {
  const egm = municipalEgm(value, code);
  return <section className="section security-panorama" data-egm-municipality={code}>
    <div className="section-head"><div><p className="eyebrow">{heading}</p><h2>Registros municipales de seguridad · 2024</h2></div><p>INE · EGM. Conteos administrativos del municipio. No son tasas ni miden todos los hechos ocurridos. Un dato faltante no significa cero incidentes.</p></div>
    <div className="security-grid">{securityCodes.map((key, index) => {
      const row = egm?.indicators.find(item => item.code === key);
      return <article key={key}><small>{labels[index]}</small><b>{row?.value === null || row?.value === undefined ? 'Sin dato verificable' : formatInteger(row.value)}</b><span>{row?.value === null ? row.note : row?.unit ?? 'Fuente municipal pendiente'}</span><em>INE EGM · 2024{row ? ` · ${row.source_table}` : ''}</em></article>;
    })}</div>
    {egm && <details><summary>Consultar los 23 indicadores y su trazabilidad · 2024</summary>
      {egm.caveats.map(note => <p key={note}>{note}</p>)}
      <p>Los establecimientos educativos no equivalen necesariamente a edificios únicos; las líneas fijas no miden acceso a internet. Las personas afectadas en tránsito no son el número de accidentes. Las cifras financieras de esta fuente se mantienen separadas de MINFIN.</p>
      <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Indicador</th><th>Valor</th><th>Unidad</th><th>Referencia y estado</th></tr></thead><tbody>{egm.indicators.map(row => <tr key={row.code}><td>{row.label}</td><td>{row.value === null ? 'Sin dato verificable' : row.unit === 'Q' ? formatCurrency(row.value) : formatInteger(row.value)}</td><td>{row.unit}</td><td>{row.source_table}{row.source_row !== null ? ` · fila ${row.source_row}` : ''} · {row.note}</td></tr>)}</tbody></table></div>
      <p>Archivo: {egm.source_file} · Hoja: {egm.source_sheet}. <a href={egm.product_url} target="_blank" rel="noreferrer">Datos normalizados</a> · <a href={egm.validation_url} target="_blank" rel="noreferrer">Validación y excepciones</a></p>
    </details>}
  </section>;
}
