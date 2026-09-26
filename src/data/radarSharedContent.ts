import { ensureRadarAccessToken } from "./radarAuth";
export type SharedContent = {id:string;kind:"resource"|"notice";title:string;body:string;category:string;storage_path:string;file_name:string;version:string};
async function sharedRequest<T>(name:string,body:Record<string,unknown>):Promise<T>{
 const token=await ensureRadarAccessToken();if(!token)throw new Error("Inicia sesión para continuar");
 const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/rest/v1/rpc/${name}`,{method:"POST",headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});
 if(!response.ok)throw new Error("No se pudo cargar el contenido de RADAR");return response.json();
}
export function loadSharedContent(campaignId:string){return sharedRequest<SharedContent[]>("radar_shared_content_v1",{p_campaign_id:campaignId});}
export function acknowledgeNotice(campaignId:string,contentId:string){return sharedRequest<boolean>("radar_ack_notice_v1",{p_campaign_id:campaignId,p_content_id:contentId});}
export async function downloadSharedResource(item:SharedContent){
 const token=await ensureRadarAccessToken();
 const response=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/authenticated/radar-shared-resources/${item.storage_path.split('/').map(encodeURIComponent).join('/')}`,{headers:{apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${token}`}});
 if(!response.ok)throw new Error("No se pudo descargar el documento");
 const url=URL.createObjectURL(await response.blob());const anchor=document.createElement("a");anchor.href=url;anchor.download=item.file_name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
