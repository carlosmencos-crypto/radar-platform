import {useEffect,useState,type FormEvent} from "react";
import {createPortal} from "react-dom";
import {beginRadarMfaChallenge,verifyRadarMfa,type RadarMfaChallenge} from "../data/radarAuth";
export function AdminReverification({onDone,onClose}:{onDone:()=>void;onClose:()=>void}) {
 const [challenge,setChallenge]=useState<RadarMfaChallenge|null>(null);
 const [error,setError]=useState("");const [busy,setBusy]=useState(false);
 useEffect(()=>{let live=true;void beginRadarMfaChallenge().then(c=>{if(live)setChallenge(c);}).catch(()=>{if(live)setError("No pudimos preparar la verificación. Volvé a ingresar desde el acceso de RADAR.");});return()=>{live=false;};},[]);
 async function submit(event:FormEvent<HTMLFormElement>){event.preventDefault();const form=event.currentTarget;const code=String(new FormData(form).get("code")??"");if(!challenge)return;setBusy(true);setError("");try{await verifyRadarMfa(challenge,code);form.reset();onDone();}catch{setError("No se pudo verificar el código. Probá con el código vigente de Google Authenticator.");}finally{setBusy(false);}}
 return createPortal(<div className="radar-notice-overlay"><section className="radar-notice-card" role="dialog" aria-modal="true" aria-label="Verificar identidad"><small>SEGURIDAD RADAR</small><h2>Confirmá que sos vos</h2><p>Ingresá el código de Google Authenticator. Tu formulario seguirá abierto.</p><form onSubmit={submit}><label>Código de seis dígitos<input name="code" type="text" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} autoComplete="one-time-code" required autoFocus style={{display:"block",padding:12,margin:"12px 0",width:"100%",boxSizing:"border-box"}}/></label>{error&&<p role="alert">{error}</p>}<button className="superadmin-primary" disabled={busy||!challenge}>{busy?"Verificando…":"Verificar y continuar"}</button><button type="button" disabled={busy} onClick={onClose}>Cancelar</button></form></section></div>,document.body);
}
