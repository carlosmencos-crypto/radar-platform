import { useState } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";

const options = [
  ["summary", "Resumen ejecutivo", "Lectura escrita y propósito del informe"],
  ["metrics", "Indicadores principales", "Cifras y estados esenciales"],
  ["charts", "Gráficas ejecutivas", "Composición electoral y avance operativo"],
  ["sections", "Áreas de control", "Hallazgos, prioridades y conexiones"],
  ["records", "Registros vigentes", "Detalle disponible del módulo"],
  ["trace", "Fuentes y trazabilidad", "Origen y clasificación de la información"],
] as const;

export function V70DirectReportBuilder({ onClose }: { section: string; onClose: () => void }) {
  const { municipality_code } = useMunicipalityContext();
  const [parts, setParts] = useState<string[]>(options.map(([key]) => key));
  const [activityScope, setActivityScope] = useState("next7");
  const toggle = (key: string) => setParts((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  function open() {
    const query = new URLSearchParams({ municipality: municipality_code, parts: parts.join(","), activities: activityScope });
    window.open(`${import.meta.env.BASE_URL}reporte/inicio?${query.toString()}`, "_blank", "noopener,noreferrer");
    onClose();
  }
  return <div className="agenda-modal" role="dialog" aria-modal="true"><section className="report-builder"><header><div><small>INFORME EJECUTIVO RADAR</small><h2>Crear reporte PDF</h2><p>El mismo informe integral está disponible desde cualquier módulo.</p></div><button aria-label="Cerrar" onClick={onClose}>×</button></header><div>{options.map(([key, label, detail]) => <label key={key}><input type="checkbox" checked={parts.includes(key)} onChange={() => toggle(key)} /><span><b>{label}</b><small>{detail}</small></span></label>)}</div><fieldset><legend>Actividades incluidas</legend>{[["all","Todas"],["past","Pasadas"],["scheduled","Programadas"],["next7","Próximos 7 días"]].map(([value,label])=><label key={value}><input type="radio" name="activity-scope" value={value} checked={activityScope===value} onChange={(event)=>setActivityScope(event.target.value)}/><span>{label}</span></label>)}</fieldset><aside><b>Documento listo para imprimir</b><span>RADAR integrará inteligencia municipal, gráficas, plan de campaña, planilla y las actividades del período elegido, sin exportar el CRM completo.</span></aside><footer><button onClick={onClose}>Cancelar</button><button className="primary" disabled={!parts.length} onClick={open}>Preparar informe</button></footer></section></div>;
}
