import {useEffect,useState} from "react";
import {useMunicipalityContext} from "../context/MunicipalityContext";
import {loadSharedContent,acknowledgeNotice,type SharedContent} from "../data/radarSharedContent";
export function RadarAnnouncement(){const {campaign_id}=useMunicipalityContext();const [items,setItems]=useState<SharedContent[]>([]);const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;if(campaign_id)void loadSharedContent(campaign_id).then(data=>{if(live)setItems(data.filter(c=>c.kind==="notice"));}).catch(()=>{});return()=>{live=false;};},[campaign_id]);
 if(!items.length)return null;const item=items[0];return <div className="agenda-modal" role="dialog" aria-modal="true" aria-label="Aviso RADAR"><section className="materials-folder-modal"><header><div><small>AVISO RADAR</small><h2>{item.title}</h2></div></header><p style={{whiteSpace:"pre-wrap",padding:"24px",lineHeight:1.7}}>{item.body}</p>{error&&<p role="alert">{error}</p>}<button type="button" disabled={busy} onClick={async()=>{setBusy(true);try{await acknowledgeNotice(campaign_id,item.id);setItems(items.slice(1));}catch(e){setError(e instanceof Error?e.message:"Intenta de nuevo");}finally{setBusy(false);}}}>{busy?"Guardando…":"Entendido"}</button></section></div>;
}
