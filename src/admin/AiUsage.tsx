import { useEffect, useState } from 'react';
import { radarAiRequest } from '../data/radarAi';
type Usage={configured:boolean;model:string;day_utc:string;daily_token_limit:number;daily_request_limit:number;campaign_daily_limit:number;requests:number;completed:number;tokens:number;reserved:number;input_tokens:number;output_tokens:number;provider:null|{observed_at:string;limits:Record<string,string>}};
const fmt=(n:number)=>n.toLocaleString('es-GT');
export default function AiUsage(){
 const [usage,setUsage]=useState<Usage|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 async function refresh(){setBusy(true);setError('');try{setUsage(await radarAiRequest<Usage>({action:'usage'}));}catch(e){setError(e instanceof Error?e.message:'No se pudo consultar el consumo.');}finally{setBusy(false);}}
 useEffect(()=>{void refresh();},[]);
 return <section className="superadmin-panel radar-ai-usage"><header><div><span>CONTROL PRIVADO</span><h2>Asistencia incluida en RADAR</h2></div><button type="button" onClick={()=>void refresh()} disabled={busy}>{busy?'Consultando…':'Actualizar consumo'}</button></header>
 {error&&<p role="alert">{error}</p>}
 {usage&&<><div className="radar-ai-usage-status"><b>{usage.configured?'Clave configurada':'Pendiente de configurar la clave'}</b><span>Groq · {usage.model}</span></div><div className="radar-ai-usage-grid">
 <article><small>Cupo interno disponible hoy</small><strong>{fmt(Math.max(0,usage.daily_token_limit-usage.tokens-usage.reserved))}</strong><span>de {fmt(usage.daily_token_limit)} tokens</span><progress max={usage.daily_token_limit} value={Math.min(usage.daily_token_limit,usage.tokens+usage.reserved)}/></article>
 <article><small>Consultas procesadas</small><strong>{fmt(usage.completed)}</strong><span>{fmt(usage.requests)} intentos · máximo {fmt(usage.daily_request_limit)} al día</span></article>
 <article><small>Consumo confirmado</small><strong>{fmt(usage.tokens)}</strong><span>{fmt(usage.reserved)} tokens reservados o pendientes de confirmar</span></article></div>
 <div className="radar-ai-usage-details"><h3>Un acceso, sin cuentas adicionales</h3><p>Cada usuario utiliza su sesión RADAR. El control de consumo y la clave son exclusivos de superadministración.</p><p>Límite inicial: {usage.campaign_daily_limit} consultas por campaña al día, compartidas por su equipo. El día de consumo se reinicia a las 00:00 UTC (18:00 de Guatemala). Fecha UTC: {usage.day_utc}.</p><p>El cupo mostrado corresponde a las solicitudes registradas por RADAR. Groq aplica además límites por minuto y de cuenta; si esta clave se usa fuera de RADAR, ese consumo no se incluye aquí.</p>
 {usage.provider&&<p>Última respuesta de Groq: {new Date(usage.provider.observed_at).toLocaleString('es-GT')}. Solicitudes restantes reportadas: {usage.provider.limits['x-ratelimit-remaining-requests']??'no informadas'}. Tokens restantes en la ventana por minuto: {usage.provider.limits['x-ratelimit-remaining-tokens']??'no informados'}.</p>}
 <h3>Ampliar cuando lo necesites</h3><p>Activar el plan Developer en Groq es una decisión manual. Tarifa de referencia para este modelo: US$0.075 por millón de tokens de entrada y US$0.30 por millón de salida. Los límites internos de RADAR continúan activos hasta que se ajusten.</p><a href="https://console.groq.com/settings/billing" target="_blank" rel="noopener noreferrer">Administrar cuenta en Groq ↗</a></div></>}
 </section>;
}
