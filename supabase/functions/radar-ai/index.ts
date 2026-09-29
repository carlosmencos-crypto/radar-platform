import { createClient } from '@supabase/supabase-js';
import { SYSTEM, redact, contextSummary } from './prompt.ts';
const MODEL = 'openai/gpt-oss-20b';
const origins = new Set(['https://radargt.wowlatam.com','https://radar-superadmin-v70-qa.netlify.app','http://localhost:5173']);
Deno.serve(async (req: Request) => {
 const origin = req.headers.get('origin') || '';
 const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://radargt.wowlatam.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply = (data:unknown,status=200) => new Response(JSON.stringify(data),{status,headers});
 if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
 if(req.method!=='POST') return reply({error:'Método no permitido'},405);
 if(origin && !origins.has(origin)) return reply({error:'Origen no permitido'},403);
 const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i,'');
 if(!token) return reply({error:'Inicia sesión en RADAR para continuar.'},401);
 const url=Deno.env.get('SUPABASE_URL')!;
 const service=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
 const user=createClient(url,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization:`Bearer ${token}`}},auth:{persistSession:false,autoRefreshToken:false}});
 let reservation:string|null=null;
 try {
  const {data:identity,error:authError}=await service.auth.getUser(token);
  if(authError || !identity.user) return reply({error:'Tu sesión terminó. Volvé a ingresar a RADAR.'},401);
  const raw=await req.text(); if(raw.length>40000) return reply({error:'La consulta es demasiado extensa.'},413);
  const body=JSON.parse(raw);
  const key=Deno.env.get('GROQ_API_KEY');
  if(body.action==='usage') {
   if(identity.user.app_metadata?.platform_role!=='super_admin') return reply({error:'Acceso exclusivo de superadministración.'},403);
   const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
   if(claims.aal!=='aal2') return reply({error:'Confirma tu identidad con la verificación en dos pasos.'},403);
   const {error:contextError}=await service.rpc('radar_admin_operator_context_v1',{p_actor_user_id:identity.user.id,p_actor_role:'super_admin'});
   if(contextError) return reply({error:'Acceso administrativo no disponible.'},403);
   const {data,error}=await service.rpc('radar_ai_usage_v1'); if(error) throw error;
   return reply({data:{...data,configured:Boolean(key),model:MODEL}});
  }
  if(body.action!=='chat' || typeof body.prompt!=='string' || !body.prompt.trim() || body.prompt.length>3000 || typeof body.context!=='string' || body.context.length>25000) return reply({error:'Revisa la consulta; utiliza hasta 3,000 caracteres.'},400);
  const {data:scopes,error:scopeError}=await user.rpc('radar_authorized_context_v2',{route_kind:body.is_demo===true?'demo':'municipality',route_key:String(body.municipality_code||'')});
  const scope=scopes?.find((s:Record<string,unknown>)=>s.campaign_id===body.campaign_id && s.is_demo===body.is_demo);
  if(scopeError || !scope || !scope.campaign_id) return reply({error:'Esta sesión no tiene acceso a la campaña seleccionada.'},403);
  if(!key) return reply({error:'IA RADAR está pendiente de activación. Tu consulta se conservó.'},503);
  const history=Array.isArray(body.history)?body.history.slice(-4).filter((m:Record<string,unknown>)=>['user','assistant'].includes(String(m.role))&&typeof m.content==='string').map((m:{role:string;content:string})=>({role:m.role,content:redact(m.content.slice(0,500))})):[];
  const messages=[{role:'system',content:SYSTEM},{role:'user',content:`Contexto resumido de ${scope.municipality_name}. Campaña ${scope.campaign_id}. Demo: ${scope.is_demo}. Los apartados pueden estar abreviados.\n${contextSummary(body.context)}`},...history,{role:'user',content:redact(body.prompt)}];
  const reserve=Math.ceil(new TextEncoder().encode(JSON.stringify(messages)).length/2)+1200;
  const {data:ticket,error:quotaError}=await service.rpc('radar_ai_reserve_v1',{p_user:identity.user.id,p_campaign:scope.campaign_id,p_tokens:reserve});
  if(quotaError) throw quotaError;
  if(!ticket.allowed) return reply({error:'La asistencia está temporalmente ocupada o alcanzó su límite de uso. Intenta más tarde; tu consulta se conservó.'},429);
  reservation=ticket.id;
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({model:MODEL,messages,max_completion_tokens:1200,reasoning_effort:'low',include_reasoning:false,stream:false}),signal:AbortSignal.timeout(45000)});
  const payload=await response.json();
  const text=payload.choices?.[0]?.message?.content;
  const success=response.ok && typeof text==='string' && text.trim().length>0;
  const provider:Record<string,string>={};
  for(const name of ['x-ratelimit-remaining-requests','x-ratelimit-remaining-tokens','x-ratelimit-reset-requests','x-ratelimit-reset-tokens','retry-after']) {const val=response.headers.get(name);if(val)provider[name]=val;}
  const {error:finishError}=await service.rpc('radar_ai_finish_v1',{p_id:reservation,p_status:success?'completed':'failed',p_input:Number(payload.usage?.prompt_tokens)||0,p_output:Number(payload.usage?.completion_tokens)||0,p_provider:provider});
  if(finishError) throw finishError;
  reservation=null;
  if(!success) return reply({error:response.status===429?'IA RADAR está ocupada. Intenta nuevamente más tarde. Tu consulta se conservó.':'No se pudo completar la respuesta. Tu consulta se conservó.'},response.status===429?429:502);
  return reply({data:{text}});
 }catch {
  // A timeout may still consume provider tokens. Keep its reservation charged conservatively.
  if(reservation) await service.rpc('radar_ai_finish_v1',{p_id:reservation,p_status:'uncertain',p_input:0,p_output:0,p_provider:{}});
  return reply({error:'No se pudo completar la consulta. Tu texto se conservó; intenta nuevamente más tarde.'},503);
 }
});
