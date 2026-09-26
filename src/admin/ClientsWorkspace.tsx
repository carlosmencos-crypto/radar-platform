import { useState, type FormEvent } from "react";
import type { AdminSnapshot } from "./radarAdminApi";

type Row = Record<string, unknown>;
type Props = { snapshot: AdminSnapshot; action: (name: string, input: Row) => Promise<boolean>; busy: boolean };
const roleNames: Record<string,string> = {campaign_admin:"Administrador",campaign_editor:"Editor",campaign_viewer:"Consulta"};
export function ClientsWorkspace({snapshot,action,busy}: Props) {
 const [query,setQuery]=useState(""); const [filter,setFilter]=useState("all"); const [code,setCode]=useState("");
 const [form,setForm]=useState<""|"assign"|"member"|"end"|"limit"|"reactivate">("");
 const [member,setMember]=useState<Row|null>(null); const [campaignId,setCampaignId]=useState("");
 const [requestId,setRequestId]=useState(()=>crypto.randomUUID()); const [page,setPage]=useState(1);
 const campaigns=snapshot.campaigns.filter(c=>!c.is_demo&&String(c.municipality_code)===code);
 const campaign=campaigns.find(c=>String(c.id)===campaignId)??campaigns.find(c=>c.status==="active")??campaigns[0];
 const municipality=snapshot.municipalities.find(m=>m.municipality_code===code);
 const accounts=snapshot.client_accounts??[]; const account=accounts.find(a=>a.campaign_id===campaign?.id);
 const members=(snapshot.campaign_members??[]).filter(m=>m.campaign_id===campaign?.id);
 const contract=snapshot.contracts.find(c=>c.campaign_id===campaign?.id&&["ACTIVE","RESERVED","SUSPENDED"].includes(String(c.status)));
 const userById=new Map(snapshot.users.map(u=>[u.id,u]));
 const protectedCode=(value:string)=>snapshot.contracts.some(c=>c.municipality_code===value&&["ACTIVE","RESERVED","SUSPENDED"].includes(String(c.status))&&(!c.valid_until||String(c.valid_until)>=new Date().toISOString().slice(0,10)));
 const items=snapshot.municipalities.filter(m=>(`${m.municipality_name} ${m.department_name} ${m.municipality_code}`).toLowerCase().includes(query.toLowerCase())&&(filter==="all"||(filter==="assigned")==protectedCode(m.municipality_code)));
 function open(kind:typeof form) {setMember(null);setForm(kind);if(kind==="assign")setRequestId(crypto.randomUUID());}
 async function submit(event:FormEvent<HTMLFormElement>) {
  event.preventDefault();const values=Object.fromEntries(new FormData(event.currentTarget));let op="";let input:Row={...values,campaign_id:campaign?.id};
  if(form==="assign"){op="onboard_client";input={...values,municipality_code:code,request_id:requestId};}
  if(form==="member"){op=member?"assign_campaign_member":"invite_campaign_member";input={...input,...(member?{user_id:member.user_id}:{}),member_role:values.member_role==="remove"?null:values.member_role,reason:"Gestión del equipo desde ficha del cliente"};}
  if(form==="end"){op="release_contract";input={...input,contract_id:contract?.id,reason:values.reason};}
  if(form==="limit")op="client_limit";
  if(form==="reactivate")op="reactivate_client";
  if(await action(op,input)){setForm("");setMember(null);}
 }
 return <div className="client-workspace">
  <div className="client-toolbar"><label>Buscar municipio<input placeholder="Nombre, departamento o código" value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} /></label><label>Mostrar<select value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);}}><option value="all">Todos los municipios</option><option value="available">Disponibles</option><option value="assigned">Con contrato</option></select></label><span>{items.length} municipios</span></div>
  <div className="client-grid">{items.slice(0,page*24).map(m=><button key={m.municipality_code} className="client-card" onClick={()=>{setCode(m.municipality_code);setCampaignId("");setForm("");}}><span className={protectedCode(m.municipality_code)?"client-pill assigned":"client-pill"}>{protectedCode(m.municipality_code)?"Con contrato":"Disponible"}</span><h3>{m.municipality_name}</h3><p>{m.department_name} · {m.municipality_code}</p><footer>{protectedCode(m.municipality_code)?"Administrar cliente":"Asignar municipio"}<b>↗</b></footer></button>)}</div>
  {items.length>page*24&&<button className="superadmin-row-button" onClick={()=>setPage(page+1)}>Mostrar más municipios</button>}
  {code&&<div className="client-backdrop"><section className="client-drawer" role="dialog" aria-modal="true" aria-label="Ficha del municipio"><header><div><small>{municipality?.department_name} · {code}</small><h2>{municipality?.municipality_name}</h2></div><button aria-label="Cerrar ficha" disabled={busy} onClick={()=>setCode("")}>×</button></header>
   <div className="client-body">{!form?<>
    {!protectedCode(code)&&<div className="client-callout"><h3>Disponible para una nueva campaña</h3><p>Asigna el municipio y envía el acceso al administrador desde aquí.</p><button className="superadmin-primary" onClick={()=>open("assign")}>+ Asignar municipio</button></div>}
    {campaigns.length>1&&<label>Campaña<select value={String(campaign?.id??"")} onChange={e=>setCampaignId(e.target.value)}>{campaigns.map(c=><option key={String(c.id)} value={String(c.id)}>{String(c.name)} · {c.status==="active"?"Activa":"Archivada / pausada"}</option>)}</select></label>}
    {campaign&&<><div className="client-heading"><div><small>CLIENTE</small><h3>{String(campaign.name)}</h3><p>{campaign.status==="active"?"Campaña activa":"Campaña pausada · información conservada"}</p></div><span className="client-pill">{members.length} / {String(account?.seat_limit??"Sin cupo configurado")}</span></div>
     {account&&<p>Administrador de contacto: <strong>{String(account.administrator_name)}</strong><br/>{String(account.administrator_email)}</p>}
     <div className="client-actions"><button className="superadmin-primary" disabled={busy||campaign.status!=="active"} onClick={()=>open("member")}>+ Agregar usuario</button>{account&&<button onClick={()=>open("limit")}>Ajustar cupo</button>}</div>
     <h3>Equipo y accesos</h3>{!members.length&&<p>Todavía no hay usuarios asignados. Si la invitación falló, agrega al administrador desde aquí usando su mismo correo.</p>}
     {members.map(m=><div className="client-member" key={String(m.user_id)}><div><strong>{String(userById.get(m.user_id)?.email??m.user_id)}</strong><small>{roleNames[String(m.member_role)]??String(m.member_role)} · {userById.get(m.user_id)?.last_sign_in_at?"Ya ingresó":"Primer ingreso pendiente"}</small></div><button onClick={()=>{setMember(m);setForm("member");}}>Editar acceso</button></div>)}
     <div className="client-lifecycle"><h3>Contrato e historial</h3>{contract?<><p>Vigencia: {String(contract.valid_from)} — {String(contract.valid_until??"Sin fecha final")}</p><button onClick={()=>open("end")}>Finalizar campaña y liberar municipio</button></>:<><p>La información anterior se conserva. Puedes reactivar la campaña si el municipio está disponible y luego asignar nuevamente sus usuarios.</p><button disabled={busy||protectedCode(code)||campaign.status==="active"} onClick={()=>open("reactivate")}>Reactivar esta campaña</button></>}</div>
    </>}
   </>:<form className="superadmin-form" onSubmit={submit}><button type="button" onClick={()=>setForm("")} disabled={busy}>← Volver a la ficha</button><h3>{{assign:"Asignar municipio",member:member?"Cambiar acceso":"Agregar usuario",end:"Finalizar campaña",limit:"Ajustar cupo",reactivate:"Reactivar campaña"}[form]}</h3>
    {form==="assign"&&<><label>Nombre del cliente o campaña<input name="name" required placeholder={`Campaña ${municipality?.municipality_name}`} /></label><label>Nombre del administrador<input name="display_name" required /></label><label>Correo del administrador<input name="email" type="email" required /></label><label>Cupo de usuarios<select name="seat_limit" defaultValue="10"><option value="10">10 cuentas · administrador incluido</option><option value="15">15 cuentas · administrador incluido</option></select></label><label>Vigencia hasta<input type="date" name="valid_until" min={new Date().toISOString().slice(0,10)} required /></label><p>El municipio quedará reservado para este cliente. Si no tiene cuenta, recibirá un enlace para crear su contraseña. Los fiscales temporales no consumen cuentas.</p></>}
    {form==="member"&&<>{!member&&<><label>Nombre<input name="display_name" required /></label><label>Correo<input name="email" type="email" required /></label></>}<label>Rol<select name="member_role" defaultValue={String(member?.member_role??"campaign_editor")}>{Object.entries(roleNames).map(([value,label])=><option value={value} key={value}>{label}</option>)}{member&&<option value="remove">Retirar acceso</option>}</select></label><p>Editor: agrega y modifica información. Consulta: solo lectura. Retirar acceso conserva la información de la campaña.</p></>}
    {form==="limit"&&<label>Cuentas contratadas<input type="number" name="seat_limit" min={Math.max(1,members.length)} max="1000" defaultValue={Number(account?.seat_limit??10)} required /></label>}
    {form==="reactivate"&&<><p>Se conservará toda su información. Los accesos deben asignarse nuevamente para evitar reactivar personas que ya no pertenecen al equipo.</p><label>Nueva vigencia hasta<input name="valid_until" type="date" min={new Date().toISOString().slice(0,10)} required /></label></>}
    {form==="end"&&<><p>Se retirarán todos los accesos. Los datos se conservarán para RADAR y una futura reactivación del mismo cliente.</p><label>Escribe {String(contract?.contract_ref)} para confirmar<input name="confirmation" required /></label><label>Motivo<textarea name="reason" required /></label></>}
    <button className="superadmin-primary" type="submit" disabled={busy}>{busy?"Procesando…":form==="assign"?"Asignar y enviar acceso":"Confirmar"}</button>
   </form>}</div>
  </section></div>}
 </div>;
}
