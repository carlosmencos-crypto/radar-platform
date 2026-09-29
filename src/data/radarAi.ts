import { ensureRadarAccessToken } from './radarAuth';
export async function radarAiRequest<T>(body: Record<string, unknown>): Promise<T> {
 const token=await ensureRadarAccessToken();
 const url=String(import.meta.env.VITE_SUPABASE_URL).replace(/\/$/,'');
 const response=await fetch(`${url}/functions/v1/radar-ai`,{method:'POST',headers:{Authorization:`Bearer ${token}`,apikey:String(import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY),'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(55000)});
 const payload=await response.json().catch(()=>({}));
 if(!response.ok) throw new Error(payload.error || 'La asistencia no está disponible en este momento. Tu consulta se conservó.');
 return payload.data as T;
}
