import { createClient } from '@supabase/supabase-js';
const origins=new Set(['https://radargt.wowlatam.com','https://radar-superadmin-v70-qa.netlify.app','http://localhost:5173']);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get('origin')||'';
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','Access-Control-Allow-Origin':origins.has(origin)?origin:'https://radargt.wowlatam.com','Access-Control-Allow-Headers':'authorization,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS'};
 const reply=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 if(origin&&!origins.has(origin))return reply({error:'Origen no permitido'},403);
 try{
  const token=req.headers.get('Authorization')?.replace(/^Bearer\s+/i,'');if(!token)return reply({error:'Inicia sesión en superadministrador.'},401);
  const client=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data,error}=await client.auth.getUser(token);
  if(error||!data.user)return reply({error:'Tu sesión terminó. Volvé a ingresar.'},401);
  if(data.user.app_metadata?.platform_role!=='super_admin')return reply({error:'Acceso exclusivo de superadministración.'},403);
  const claims=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
  if(claims.aal!=='aal2')return reply({error:'MFA_AAL2_REQUIRED'},403);
  const text=await req.text();if(text.length>40000)return reply({error:'La solicitud es demasiado extensa.'},413);
  const body=JSON.parse(text);
  const result=await client.rpc('radar_admin_shared_activities_v1',{p_actor:data.user.id,p_action:body.action,p_input:body.input??{}});
  if(result.error)return reply({error:result.error.message},400);
  return reply({data:result.data});
 }catch{return reply({error:'No se pudo completar el envío. Conservamos el formulario para reintentar.'},503);}
});
