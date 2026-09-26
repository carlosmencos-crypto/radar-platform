import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
const origins=new Set(["https://radar-superadmin-v70-qa.netlify.app","http://localhost:5173"]);
Deno.serve(async(req:Request)=>{
 const origin=req.headers.get("origin")??"";
 const headers={"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":origins.has(origin)?origin:"https://radar-superadmin-v70-qa.netlify.app","Access-Control-Allow-Headers":"authorization,apikey,content-type","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
 const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(req.method!=="POST")return reply({error:"Método no permitido"},405);
 try {
  const token=req.headers.get("Authorization")?.replace(/^Bearer /,"");if(!token)return reply({error:"Inicia sesión"},401);
  const service=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:identity,error:authError}=await service.auth.getUser(token);if(authError||!identity.user)return reply({error:"Sesión inválida"},401);
  const body=await req.json();const campaignId=String(body.campaign_id??"");const input=body.input??{};const action=String(body.action??"list");
  async function rpc(operation:string,values:unknown={}){const {data,error}=await service.rpc("radar_campaign_team_v1",{p_actor_user_id:identity.user!.id,p_campaign_id:campaignId,p_operation:operation,p_input:values});if(error)throw error;return data;}
  if(action==="list")return reply({data:await rpc("list")});
  if(action==="invite"){
   if(!origins.has(origin))return reply({error:"Origen no permitido"},403);
   if(!["campaign_editor","campaign_viewer"].includes(input.member_role))throw new Error("Selecciona Editor o Consulta");
   const scope=await rpc("prepare_invite");const email=String(input.email??"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw new Error("Correo inválido");
   let target;
   for(let page=1;;page++){const {data,error}=await service.auth.admin.listUsers({page,perPage:1000});if(error)throw error;target=data.users.find(u=>u.email?.toLowerCase()===email);if(target||data.users.length<1000)break;}
   if(!target){const {data,error}=await service.auth.admin.inviteUserByEmail(email,{data:{display_name:String(input.display_name??"")},redirectTo:`${origin}/acceso?next=${encodeURIComponent(`/municipio/${scope.municipality_code}`)}`});if(error)throw error;target=data.user;}
   if(!target)throw new Error("No se pudo preparar el acceso");return reply({data:await rpc("assign",{user_id:target.id,member_role:input.member_role})});
  }
  if(action==="assign"||action==="remove")return reply({data:await rpc(action,input)});
  return reply({error:"Operación inválida"},400);
 }catch(error){return reply({error:error instanceof Error?error.message:String((error as {message?:string}).message??"No se pudo completar")},400);}
});
