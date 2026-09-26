/* Verify identity and municipal authorization before loading the existing app. */
const url='https://xxobbhnhxhcjkdxmjmwj.supabase.co';
const apikey='sb_publishable_dtvSaFdTJeZ1LAslek8Yjg_PVKGtDZn';
const key='radar-supabase-session-v1';
const entry='/assets/index-kL2TVExC.js';
const municipal=location.pathname.match(/^\/municipio\/(\d{4})(d)?(?:\/|$)/)||location.pathname.match(/^\/(\d{4})(d)(?:\/|$)/);
const protectedRoute=Boolean(municipal)||/^\/(municipios|demos)\/?$/.test(location.pathname);
let loggingOut=false;
function login(){if(loggingOut)return;localStorage.removeItem(key);location.replace(`/?login=1&next=${encodeURIComponent(location.pathname+location.search)}`);}
async function verify(){
 if(!protectedRoute)return true;
 if(localStorage.getItem('radar-session-persistence')==='session'&&!sessionStorage.getItem('radar-session-tab')){login();return false;}
 let session;try{session=JSON.parse(localStorage.getItem(key)||'null');}catch{login();return false;}
 if(!session?.access_token){login();return false;}
 if(session.expires_at<=Date.now()+60000){
  const response=await fetch(`${url}/auth/v1/token?grant_type=refresh_token`,{method:'POST',headers:{apikey,'Content-Type':'application/json'},body:JSON.stringify({refresh_token:session.refresh_token})});
  if(!response.ok){login();return false;}const data=await response.json();session={access_token:data.access_token,refresh_token:data.refresh_token,expires_at:Date.now()+data.expires_in*1000,token_type:data.token_type};localStorage.setItem(key,JSON.stringify(session));
 }
 const headers={apikey,Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'};
 const identity=await fetch(`${url}/auth/v1/user`,{headers});if(!identity.ok){login();return false;}
 if(municipal){const demo=Boolean(municipal[2])||new URLSearchParams(location.search).get('demo')==='1';const response=await fetch(`${url}/rest/v1/rpc/radar_authorized_context_v2`,{method:'POST',headers,body:JSON.stringify({route_kind:demo?'demo':'municipality',route_key:municipal[1]})});const data=await response.json();if(!response.ok||!Array.isArray(data)||!data.length){showError('Tu cuenta no tiene acceso a este municipio.');return false;}}
 return true;
}
function showError(message){document.body.replaceChildren();const panel=document.createElement('main');panel.style.cssText='max-width:560px;margin:15vh auto;padding:32px;font:18px system-ui;line-height:1.7';const title=document.createElement('h1');title.textContent='Acceso RADAR';const description=document.createElement('p');description.textContent=message;const link=document.createElement('a');link.href='/?login=1';link.textContent='Volver al ingreso';panel.append(title,description,link);document.body.append(panel);}
function logout(){
 if(loggingOut)return;
 loggingOut=true;
 let session;try{session=JSON.parse(localStorage.getItem(key)||'null');}catch{}
 localStorage.removeItem(key);
 localStorage.removeItem('radar-session-persistence');
 sessionStorage.removeItem('radar-session-tab');
 sessionStorage.removeItem('radar-supabase-callback-v1');
 // Send revocation without keeping the private app open or waiting on network latency.
 try{if(session?.access_token)void fetch(`${url}/auth/v1/logout`,{method:'POST',headers:{apikey,Authorization:`Bearer ${session.access_token}`},keepalive:true}).catch(()=>{});}catch{}
 location.replace('/');
}
document.addEventListener('click',event=>{
 const element=event.target instanceof Element?event.target.closest('a,button'):null;
 if(!element)return;
 const label=(element.getAttribute('aria-label')||element.textContent||'').replace(/\s+/g,' ').trim();
 if(label!=='Cerrar sesión'&&!element.getAttribute('href')?.includes('signout-with-chatgpt'))return;
 event.preventDefault();event.stopImmediatePropagation();logout();
},true);
window.addEventListener('pageshow',event=>{if(event.persisted&&protectedRoute)location.reload();});
try{if(await verify()&&!loggingOut)await import(entry);}catch{showError('No pudimos verificar el acceso. Revisa tu conexión y vuelve a intentar.');}

