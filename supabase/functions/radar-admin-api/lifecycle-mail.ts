import nodemailer from "npm:nodemailer@10.0.11";
import type { SupabaseClient } from "@supabase/supabase-js";

export type LifecycleMessage = { id:string; kind:"concluded"|"reactivated"|"deleted"; recipient:string; municipality_name:string; municipality_code:string };
const escape = (s:string) => s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function lifecycleMessage(item:LifecycleMessage) {
 const titles={concluded:"Tu campaña ha concluido",reactivated:"Tu campaña está activa nuevamente",deleted:"Eliminación definitiva de los datos de tu campaña"};
 const paragraphs={
  concluded:[`La campaña de ${item.municipality_name} ha concluido y sus accesos han sido retirados.`,"Tu información privada permanece resguardada por RADAR. Si decides regresar, podremos reactivar esta campaña y recuperar su información, siempre que el municipio esté disponible.","Tu cuenta continúa existiendo. Si tienes otros municipios asignados, puedes seguir entrando a ellos con tu mismo correo y contraseña."],
  reactivated:[`La campaña de ${item.municipality_name} está activa nuevamente. Tu acceso de administrador y la información conservada están disponibles.`,"Ingresa con tu correo y contraseña habituales. Desde Configuración podrás volver a invitar a los integrantes de tu equipo.","Si administras varios municipios, elige el que deseas abrir desde Mis municipios."],
  deleted:[`Los datos privados de tu campaña de ${item.municipality_name} fueron eliminados definitivamente del sistema operativo de RADAR. Esta campaña ya no podrá reactivarse con su información anterior.`,"Tu cuenta personal permanece disponible para otras campañas. Este borrado no afecta a los demás municipios que tengas asignados ni a la inteligencia municipal de RADAR.","Las copias de respaldo, si existen, permanecen sujetas a su período de retención y no están disponibles para reactivar la campaña. Conservamos la constancia técnica y de envío de esta notificación."]
 };
 const title=titles[item.kind]; const text=[title,`Municipio: ${item.municipality_name}`, ...paragraphs[item.kind],"Equipo RADAR · radargt@wowlatam.com"].join("\n\n");
 const html=`<!doctype html><html lang="es"><body style="margin:0;background:#f7f6ef;font-family:Arial,sans-serif;color:#2e343b"><table role="presentation" width="100%"><tr><td style="padding:40px 20px"><table role="presentation" style="max-width:580px;width:100%;margin:auto;background:white;border:1px solid #e3e5e1;border-radius:16px"><tr><td style="padding:36px;text-align:left"><img src="https://radargt.wowlatam.com/assets/radar-welcome-logo.png" alt="RADAR electoral" width="180" style="display:block;margin-left:-9px;margin-bottom:30px"><p style="color:#08576e;font-size:11px;letter-spacing:2px;font-weight:bold">TU EQUIPO. TU MUNICIPIO. TU RADAR.</p><h1 style="font-size:25px;line-height:1.3;margin:18px 0">${escape(title)}</h1><p style="color:#08576e;font-weight:bold">${escape(item.municipality_name)} · ${escape(item.municipality_code)}</p>${paragraphs[item.kind].map(p=>`<p style="font-size:15px;line-height:1.7;color:#555e63">${escape(p)}</p>`).join("")}${item.kind==='reactivated'?'<p style="margin-top:28px"><a href="https://radargt.wowlatam.com/?login=1" style="display:inline-block;background:#5a2973;color:white;text-decoration:none;padding:13px 22px;border-radius:8px">Ingresar a RADAR</a></p>':''}<p style="border-top:1px solid #e5e7e3;padding-top:22px;margin-top:30px;font-size:12px;color:#6a7478">Equipo RADAR<br>radargt@wowlatam.com</p></td></tr></table></td></tr></table></body></html>`;
 return {subject:`RADAR · ${title} · ${item.municipality_name}`,text,html};
}
export async function deliverLifecycleMail(service:SupabaseClient,id:unknown) {
 if(typeof id!=="string") return {mail_status:"not_applicable"};
 const {data,error}=await service.rpc("radar_lifecycle_mail_v1",{p_operation:"claim",p_id:id});
 if(error) return {mail_status:"pending"};
 if(!data) return {mail_status:"unchanged"};
 const item=data as LifecycleMessage;
 try {
  const password=Deno.env.get("RADAR_SMTP_PASSWORD");
  if(!password) throw new Error("SMTP_NOT_CONFIGURED");
  const transport=nodemailer.createTransport({host:"smtp.hostinger.com",port:465,secure:true,auth:{user:"radargt@wowlatam.com",pass:password},connectionTimeout:10000,greetingTimeout:10000,socketTimeout:15000,tls:{rejectUnauthorized:true}});
  try {
   const delivered=await transport.sendMail({from:'"RADAR · Inteligencia Electoral" <radargt@wowlatam.com>',to:item.recipient,messageId:`<radar-lifecycle-${item.id}@wowlatam.com>`,...lifecycleMessage(item)});
   if(!delivered.accepted?.length) throw new Error("SMTP_REJECTED");
  } finally {transport.close();}
  const {error:saveError}=await service.rpc("radar_lifecycle_mail_v1",{p_operation:"sent",p_id:id});
  // A receipt write failure must not trigger an automatic duplicate send.
  return {mail_status:saveError?"receipt_pending":"sent"};
 } catch(error) {
  const reason=error instanceof Error&&error.message==="SMTP_NOT_CONFIGURED"?"Falta conectar el correo transaccional de RADAR.":"El proveedor no confirmó el envío. Revisa la configuración antes de reintentar.";
  await service.rpc("radar_lifecycle_mail_v1",{p_operation:"failed",p_id:id,p_error:reason});
  return {mail_status:"failed",mail_error:reason};
 }
}
