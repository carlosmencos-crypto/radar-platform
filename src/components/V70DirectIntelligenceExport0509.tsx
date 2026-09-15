import { useMemo, useState } from "react";
import { getInstalledRadarElectoralLayers } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectoralViewModel } from "../data/v70ElectoralAdapter";

type ExportSection = "electoral" | "center" | "territory" | "indicators" | "finance";
type Props = { open: boolean; onOpen: () => void; onClose: () => void; electionCode?: string; centerId?: string };

function resolveViewModel(): V70ElectoralViewModel | null {
  const layers = getInstalledRadarElectoralLayers("0509") ?? [];
  if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null;
  try { return adaptAuthorizedElectoralTerritoryLayers(layers); }
  catch (error) { console.error("RADAR_V70_EXPORT_ADAPTER_FAIL_CLOSED", "0509", error); return null; }
}

export function V70DirectIntelligenceExport0509({ open, onOpen, onClose, electionCode, centerId }: Props) {
  const view = useMemo(() => resolveViewModel(), []);
  const [exportSections, setExportSections] = useState<Record<ExportSection, boolean>>({ electoral: true, center: true, territory: true, indicators: true, finance: true });
  const election = view?.elections.find((item) => item.code === electionCode)
    ?? view?.elections.find((item) => item.code === "CORPORACION_MUNICIPAL")
    ?? view?.elections[0]
    ?? null;
  const selected = view?.centers.find((item) => item.id === centerId) ?? view?.centers[0] ?? null;

  function exportPdf() {
    const blocks = Object.entries(exportSections).filter(([, enabled]) => enabled).map(([key]) => key).join(",");
    const query = new URLSearchParams({ blocks });
    if (election) query.set("election", election.code);
    if (selected) query.set("center", selected.id);
    onClose();
    window.open(`/reporte/municipio-360?${query.toString()}`, "_blank", "noopener,noreferrer");
  }

  return <>
    <button className="floating-export" onClick={onOpen}><span>↓</span><div><b>Exportar vista</b><small>Reporte PDF personalizado</small></div></button>
    {open ? <div className="export-backdrop" role="dialog" aria-modal="true" aria-label="Configurar reporte PDF" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><div className="export-panel"><div className="export-head"><div><span>REPORTE EJECUTIVO</span><h3>Exportar esta lectura</h3></div><button onClick={onClose} aria-label="Cerrar">×</button></div><p>El PDF conservará la elección y el centro que estás visualizando. Selecciona los bloques que necesita el usuario.</p><div className="export-current"><span>Elección activa</span><b>{election?.shortName ?? "No publicado"}</b><span>Centro activo</span><b>{selected ? `CV ${selected.id} · ${selected.name}` : "Sin centro publicado"}</b></div><div className="export-options">{([
      ["electoral", "Lectura electoral municipal"], ["center", "Detalle del centro seleccionado"], ["territory", "Comunidades y territorio"], ["indicators", "Indicadores municipales"], ["finance", "Finanzas y gestión"],
    ] as [ExportSection, string][]).map(([key, label]) => <label key={key}><input type="checkbox" checked={exportSections[key]} onChange={() => setExportSections((value) => ({ ...value, [key]: !value[key] }))}/><span>{label}</span></label>)}</div><div className="export-actions"><button className="secondary" onClick={onClose}>Cancelar</button><button className="primary" disabled={!Object.values(exportSections).some(Boolean)} onClick={exportPdf}>Generar PDF</button></div><small className="export-help">Se abrirá la vista de impresión del navegador. Selecciona “Guardar como PDF”. Incluye fecha, marca RADAR, municipio y trazabilidad de fuentes.</small></div></div> : null}
  </>;
}
