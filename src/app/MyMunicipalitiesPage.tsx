import {useEffect,useState} from "react";
import {Link,useNavigate,useSearchParams} from "react-router-dom";
import {ensureRadarAccessToken} from "../data/radarAuth";
type Access={universal:boolean;campaigns:Array<{campaign_id:string;name:string;municipality_code:string;municipality_name:string;department_name:string;role:string}>};
export function MyMunicipalitiesPage(){
 const navigate=useNavigate();const [params]=useSearchParams();const [access,setAccess]=useState<Access|null>(null);const [error,setError]=useState("");
 useEffect(()=>{let live=true;void(async()=>{
  try{const token=await ensureRadarAccessToken();if(!token){navigate("/acceso?next=/mis-municipios",{replace:true});return;}
   const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/radar_my_campaigns_v1`,{method:"POST",headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:"{}"});
   if(!response.ok)throw new Error("No pudimos consultar tus accesos. Intenta nuevamente.");const data=await response.json() as Access;
   if(!live)return;
   if(data.universal&&params.get("auto")==="1"){navigate("/municipios",{replace:true});return;}
   if(data.campaigns.length===1&&params.get("auto")==="1"){navigate(`/municipio/${data.campaigns[0].municipality_code}`,{replace:true});return;}
   setAccess(data);
  }catch(e){if(live)setError(e instanceof Error?e.message:"No se pudo cargar tu equipo.");}
 })();return()=>{live=false;};},[navigate,params]);
 return <main className="my-municipalities"><header><img src="/assets/radar-welcome-logo.png" alt="RADAR electoral"/><a href="/signout-with-chatgpt?return_to=%2F">Cerrar sesión</a></header><section><small>TUS ESPACIOS DE TRABAJO</small><h1>Mis municipios</h1><p>Elige la campaña que quieres abrir. La información y los permisos de cada municipio se mantienen separados.</p>{error?<p role="alert">{error} <button onClick={()=>window.location.reload()}>Reintentar</button></p>:!access?<p role="status">Consultando tus accesos…</p>:<>{access.universal&&<Link className="municipality-access-card" to="/municipios"><h2>Directorio nacional</h2><p>Acceso de administración RADAR ↗</p></Link>}<div className="municipality-access-grid">{access.campaigns.map(c=><Link key={c.campaign_id} to={`/municipio/${c.municipality_code}`} className="municipality-access-card"><small>{c.department_name} · {c.municipality_code}</small><h2>{c.municipality_name}</h2><p>{c.name}</p><footer><span>{{campaign_admin:"Administrador",campaign_editor:"Editor",campaign_viewer:"Consulta"}[c.role]??"Miembro"}</span><b aria-hidden="true">↗</b></footer></Link>)}</div>{!access.campaigns.length&&!access.universal&&<div className="municipality-access-card"><h2>Aún no tienes campañas activas</h2><p>Tu cuenta sigue disponible. Contacta al equipo RADAR para asignar o reactivar un municipio.</p><a href="mailto:radargt@wowlatam.com">Contactar a RADAR</a></div>}</>}</section></main>;
}
