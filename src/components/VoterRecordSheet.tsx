import { createPortal } from "react-dom";
import { useState } from "react";
import type { AuthorizedVoterDetail } from "../data/radarRuntime";
import { getInstalledRadarRuntime } from "../data/radarRuntimeCache";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { useDismissibleDialog } from "../admin/useDismissibleDialog";
import { useV70CampaignBrand } from "./useV70CampaignBrand";
import { LocationMap } from "./ResourceRecordSheet";
import "../styles/voter-record-sheet.css";

type Props = { detail: AuthorizedVoterDetail; dpi: string; onReveal: () => void; onClose: () => void };
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
const statuses: Record<string,string> = { SIN_CONTACTO:"Sin contacto",CONTACTADO:"Contactado",INTERESADO:"Interesado",NO_INTERESADO:"No interesado",VOLUNTARIO:"Voluntario",LIDER:"Líder" };
function Photo({ src, label, portrait = false }: { src: string; label: string; portrait?: boolean }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return null;
  return <figure className={portrait ? "voter-record-portrait" : "voter-record-document"}><img src={src} alt={label} onError={() => setFailed(true)}/>{!portrait && <figcaption>{label}</figcaption>}</figure>;
}
function date(value: unknown) {
  const parsed = new Date(text(value));
  return Number.isFinite(parsed.getTime()) ? new Intl.DateTimeFormat("es-GT", {dateStyle:"medium"}).format(parsed) : "";
}
export function VoterRecordSheetView({detail,dpi,onReveal,onClose,municipalityName,departmentName,campaignName,partyName,isDemo}: Props & {municipalityName:string;departmentName:string;campaignName:string;partyName:string;isDemo:boolean}) {
  useDismissibleDialog(true,onClose);
  const p=detail.profile, person=detail.elector;
  const photo=text(p.photo_url), front=text(p.dpi_front_url)||text(p.dpi_front_data_url), back=text(p.dpi_back_url)||text(p.dpi_back_data_url);
  const lat=Number(p.latitude), lon=Number(p.longitude);
  const located=p.latitude!=null && p.longitude!=null && p.latitude!=="" && p.longitude!=="" && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=85 && Math.abs(lon)<=180;
  const contactFields=[
    ["Teléfono principal",text(p.phone_primary)],["Teléfono secundario",text(p.phone_secondary)],
    ["Comunidad confirmada",text(p.confirmed_community)],["Dirección",text(p.exact_address)],
    ["Referencia de ubicación",text(p.location_reference)],["Responsable",text(p.assigned_person_name)],
    ["Estado de contacto",statuses[text(p.contact_status)]||text(p.contact_status)],["Rol o responsabilidad",text(p.campaign_role)],
    ["Afiliación declarada",p.party_affiliation==="SI"?"Sí":p.party_affiliation==="NO"?"No":""],
    ["Próxima acción",text(p.next_action)],["Fecha de próxima acción",date(p.next_action_at)],
  ].filter(([,value])=>value);
  return createPortal(<div className="resource-sheet-backdrop voter-record-backdrop" onClick={e=>{if(e.target===e.currentTarget)onClose();}}><section className="resource-sheet voter-record-sheet" role="dialog" aria-modal="true" aria-labelledby="voter-record-title">
    <header className="voter-record-heading"><div><small>RADAR · FICHA PERSONAL{isDemo?" · DEMO":""}</small><h2 id="voter-record-title">{person.full_name}</h2><p>{municipalityName}{departmentName?` · ${departmentName}`:""}</p></div><button type="button" aria-label="Cerrar ficha de consulta" onClick={onClose}>×</button></header>
    <div className="voter-record-context"><span>CAMPAÑA 2027{isDemo?" · DEMOSTRACIÓN":""}</span><strong>{partyName||"Partido sin registrar"}</strong>{campaignName && <small>{campaignName}</small>}</div>
    <div className={`voter-record-identity${photo?" has-photo":""}`}>
      {photo && <Photo src={photo} label={`Fotografía de ${person.full_name}`} portrait/>}
      <dl><div><dt>DPI</dt><dd>{dpi||person.masked_identification||"Sin dato registrado"}</dd>{!dpi && person.masked_identification && <button type="button" className="voter-record-reveal" onClick={onReveal}>Revelar DPI</button>}</div><div><dt>Edad estimada a 2026</dt><dd>{person.estimated_age_2026==null?"Sin dato registrado":`${person.estimated_age_2026} años`}</dd></div><div className="voter-record-wide"><dt>Comunidad de referencia</dt><dd>{person.community||"Sin dato registrado"}</dd></div></dl>
    </div>
    {contactFields.length>0 && <section className="voter-record-section"><h3>Datos de contacto y seguimiento</h3><dl>{contactFields.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
    {located && <section className="voter-record-section"><div className="voter-record-section-title"><h3>Ubicación registrada</h3><a href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`} target="_blank" rel="noopener noreferrer">Abrir mapa ↗</a></div><LocationMap latitude={lat} longitude={lon} label="Punto registrado de esta persona"/><p className="voter-record-caption">{lat.toFixed(5)}, {lon.toFixed(5)}</p></section>}
    {(front||back) && <section className="voter-record-section"><h3>Documento de identificación</h3><div className="voter-record-documents"><Photo src={front} label="DPI · Frente"/><Photo src={back} label="DPI · Reverso"/></div></section>}
    {text(p.notes) && <section className="voter-record-section"><h3>Observaciones</h3><p className="voter-record-notes">{text(p.notes)}</p></section>}
    {detail.interactions.length>0 && <section className="voter-record-section"><h3>Historial</h3><ol className="voter-record-history">{[...detail.interactions].sort((a,b)=>text(b.interaction_at).localeCompare(text(a.interaction_at))).map((row,i)=><li key={String(row.id??i)}><div><b>{text(row.interaction_type).replace("REUNION","REUNIÓN")||"Contacto"}</b><time>{date(row.interaction_at)}</time></div>{text(row.notes)&&<p>{text(row.notes)}</p>}{text(row.commitment)&&<p>{text(row.commitment)}</p>}{text(row.responsible_name)&&<small>{text(row.responsible_name)}</small>}</li>)}</ol></section>}
    <footer className="resource-sheet-actions voter-record-actions"><span>Datos guardados · Ficha privada{isDemo?" · DEMO":""}</span><button type="button" onClick={onClose}>Volver</button><button type="button" className="resource-sheet-print" onClick={()=>window.print()}>Imprimir ficha</button></footer>
  </section></div>,document.body);
}
export default function VoterRecordSheet(props:Props) {
  const {municipality_code,municipality_name,department_name,campaign_id,consumer}=useMunicipalityContext();
  const {partyName}=useV70CampaignBrand();
  const context=getInstalledRadarRuntime(municipality_code)?.context;
  const campaignName=context?.campaign_id===campaign_id && context?.is_demo===consumer.context.is_demo ? context.campaign_name||"" : "";
  return <VoterRecordSheetView {...props} municipalityName={municipality_name} departmentName={department_name} campaignName={campaignName} partyName={partyName} isDemo={consumer.context.is_demo}/>;
}
