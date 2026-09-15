import { useState } from "react";

const options = [
  ["summary", "Resumen ejecutivo", "Lectura escrita y propósito del informe"],
  ["metrics", "Indicadores principales", "Cifras y estados esenciales"],
  ["sections", "Áreas de control", "Hallazgos, prioridades y conexiones"],
  ["records", "Registros vigentes", "Detalle disponible del módulo"],
  ["trace", "Fuentes y trazabilidad", "Origen y clasificación de la información"],
] as const;

export function V70DirectReportBuilder({ section, onClose }: { section: string; onClose: () => void }) {
  const [parts, setParts] = useState<string[]>(options.map(([key]) => key));
  const toggle = (key: string) => setParts((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  function open() {
    window.open(`/reporte/${encodeURIComponent(section)}?parts=${encodeURIComponent(parts.join(","))}`, "_blank", "noopener,noreferrer");
    onClose();
  }
  return <div className="agenda-modal" role="dialog" aria-modal="true"><section className="report-builder"><header><div><small>INFORME EJECUTIVO RADAR</small><h2>Crear reporte PDF</h2><p>Elige la información que necesita recibir el candidato o el equipo.</p></div><button aria-label="Cerrar" onClick={onClose}>×</button></header><div>{options.map(([key, label, detail]) => <label key={key}><input type="checkbox" checked={parts.includes(key)} onChange={() => toggle(key)} /><span><b>{label}</b><small>{detail}</small></span></label>)}</div><aside><b>Documento escrito, no solo una captura</b><span>RADAR organizará la información disponible en una portada, lectura ejecutiva, indicadores, áreas de control y registros consultables.</span></aside><footer><button onClick={onClose}>Cancelar</button><button className="primary" disabled={!parts.length} onClick={open}>Preparar informe</button></footer></section></div>;
}
