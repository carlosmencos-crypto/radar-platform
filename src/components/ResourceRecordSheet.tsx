import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { CampaignModuleRecord } from "../data/radarRuntime";
import { useV70CampaignBrand } from "./useV70CampaignBrand";
import { useMunicipalityContext } from "../context/MunicipalityContext";

const fields = { responsible: "Responsable", pilot: "Piloto", brand: "Marca", line: "Línea", model: "Modelo", plate: "Placa", color: "Color", quantity: "Cantidad", address: "Dirección", location_name: "Ubicación", characteristics: "Características", authorizedUse: "Uso autorizado", specifications: "Especificaciones" };
export default function ResourceRecordSheet({ record, onClose }: { record: CampaignModuleRecord; onClose: () => void }) {
  const { identity } = useV70CampaignBrand();
  const { municipality_name, department_name } = useMunicipalityContext();
  useEffect(() => { const close = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); }; document.addEventListener("keydown", close); return () => document.removeEventListener("keydown", close); }, [onClose]);
  return createPortal(<div className="resource-sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section className="resource-sheet" role="dialog" aria-modal="true" aria-label="Ficha del recurso"><header><div><small>RADAR · BANCO DE RECURSOS</small><h2>{record.title}</h2><p>{record.category} · {municipality_name} · {department_name}</p></div>{identity.party_logo_data_url && <img src={identity.party_logo_data_url} alt={identity.party_name || "Partido"}/>}</header><dl>{Object.entries(fields).filter(([key]) => record.payload[key] !== null && record.payload[key] !== undefined && record.payload[key] !== "").map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{String(record.payload[key])}</dd></div>)}</dl>{record.details && <section><h3>Observaciones</h3><p>{record.details}</p></section>}<footer><button onClick={onClose}>Cerrar</button><button onClick={() => window.print()}>Imprimir ficha</button></footer></section></div>, document.body);
}
