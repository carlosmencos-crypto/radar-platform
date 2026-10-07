import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { downloadCampaignVaultFile, type CampaignModuleRecord } from "../data/radarRuntime";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { useV70CampaignBrand } from "./useV70CampaignBrand";
import { useMunicipalityContext } from "../context/MunicipalityContext";

const fields = { responsible: "Responsable", pilot: "Piloto", brand: "Marca", line: "Línea", model: "Modelo", plate: "Placa", color: "Color", quantity: "Cantidad", address: "Dirección", location_name: "Referencia de ubicación", characteristics: "Características", authorizedUse: "Uso autorizado", specifications: "Especificaciones" };
function LocationMap({ latitude, longitude }: { latitude: number; longitude: number }) {
  const [failed, setFailed] = useState(false);
  const zoom = 15, size = 2 ** zoom;
  const x = (longitude + 180) / 360 * size;
  const rad = Math.min(85, Math.max(-85, latitude)) * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2 * size;
  return <div className="resource-sheet-map" role="img" aria-label="Ubicación de la sede en el mapa">
    {!failed ? <><div className="resource-map-tiles">{[-1, 0, 1].flatMap(dy => [-1, 0, 1].map(dx => <img key={`${dx}:${dy}`} alt="" onError={() => setFailed(true)} src={`https://tile.openstreetmap.org/${zoom}/${Math.floor(x) + dx}/${Math.floor(y) + dy}.png`} style={{ left: `calc(50% + ${(Math.floor(x) + dx - x) * 256}px)`, top: `calc(50% + ${(Math.floor(y) + dy - y) * 256}px)` }} />))}</div><span className="resource-map-pin" aria-hidden="true">●</span><small>© OpenStreetMap contributors</small></> : <p>No se pudo cargar el mapa. La ubicación está guardada en las coordenadas indicadas.</p>}
  </div>;
}
export default function ResourceRecordSheet({ record, onClose }: { record: CampaignModuleRecord; onClose: () => void }) {
  const { identity } = useV70CampaignBrand();
  const { municipality_name, department_name, consumer } = useMunicipalityContext();
  const is_demo = consumer.context.is_demo;
  const dialog = useRef<HTMLElement>(null);
  const [photo, setPhoto] = useState("");
  const [photoState, setPhotoState] = useState<"loading" | "empty" | "ready" | "error">("empty");
  useEffect(() => {
    let active = true, url = "";
    const path = typeof record.payload.file_path === "string" ? record.payload.file_path : "";
    const legacy = typeof record.payload.file_data === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(record.payload.file_data) ? record.payload.file_data : "";
    setPhoto(""); setPhotoState(path ? "loading" : legacy ? "ready" : "empty");
    if (path) void ensureRadarAccessToken().then(token => downloadCampaignVaultFile(path, token)).then(blob => {
      if (!active) return;
      if (!/^image\/(png|jpeg|webp)$/.test(blob.type)) throw new Error("Formato no compatible");
      url = URL.createObjectURL(blob); setPhoto(url); setPhotoState("ready");
    }).catch(() => { if (active) setPhotoState("error"); });
    else if (legacy) setPhoto(legacy);
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [record.id, record.payload.file_path, record.payload.file_data]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.current?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const controls = dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], [tabindex="0"]');
        if (!controls?.length) return;
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener("keydown", close);
    return () => { document.removeEventListener("keydown", close); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);
  const lat = Number(record.payload.latitude), lon = Number(record.payload.longitude);
  const located = record.category === "Sede" && record.payload.latitude != null && record.payload.longitude != null && record.payload.latitude !== "" && record.payload.longitude !== "" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 85 && Math.abs(lon) <= 180;
  const details = Object.entries(fields).filter(([key]) => record.payload[key] != null && record.payload[key] !== "");
  return createPortal(<div className="resource-sheet-backdrop" onClick={e => { if (e.target === e.currentTarget) onClose(); }}><section ref={dialog} tabIndex={-1} className="resource-sheet" role="dialog" aria-modal="true" aria-labelledby="resource-sheet-title">
    <header className="resource-sheet-heading"><div><small>RADAR · BANCO DE RECURSOS{is_demo ? " · DEMO" : ""}</small><h2 id="resource-sheet-title">{record.title}</h2><p>{municipality_name} · {department_name}</p><span className="resource-sheet-category">{String(record.payload.custom_type || record.category)}</span></div>{identity.party_logo_data_url && <img src={identity.party_logo_data_url} alt={identity.party_name || "Partido"}/>}</header>
    <div className={`resource-sheet-body${photo ? " has-photo" : ""}`}>
      {photo && <figure className="resource-sheet-photo"><img src={photo} alt={`Fotografía de ${record.title}`} onError={() => { setPhoto(""); setPhotoState("error"); }}/><figcaption>Fotografía del recurso</figcaption></figure>}
      <section className="resource-sheet-details"><h3>Información del recurso</h3>{details.length ? <dl>{details.map(([key,label]) => <div key={key}><dt>{label}</dt><dd>{String(record.payload[key])}</dd></div>)}</dl> : <p className="resource-sheet-note">Aún no se han agregado detalles adicionales.</p>}{!photo && <p className="resource-sheet-note" role="status">{photoState === "loading" ? "Cargando fotografía…" : photoState === "error" ? "La fotografía no está disponible en este momento." : "Sin fotografía registrada."}</p>}</section>
    </div>
    {record.category === "Sede" && <section className="resource-sheet-location"><div><h3>Ubicación de la sede</h3>{located && <a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noopener noreferrer">Abrir mapa ↗</a>}</div>{located ? <><LocationMap latitude={lat} longitude={lon}/><p className="resource-sheet-note">{lat.toFixed(6)}, {lon.toFixed(6)}</p></> : <p className="resource-sheet-note">Sin ubicación registrada en el mapa.</p>}</section>}
    {record.details && <section className="resource-sheet-notes"><h3>Observaciones</h3><p>{record.details}</p></section>}
    <footer className="resource-sheet-actions"><span>Ficha de recurso · RADAR</span><button type="button" onClick={onClose}>Cerrar</button><button type="button" className="resource-sheet-print" disabled={photoState === "loading"} onClick={() => window.print()}>Imprimir ficha</button></footer>
  </section></div>, document.body);
}
