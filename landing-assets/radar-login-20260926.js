/* RADAR landing authentication. Uses the same session contract as the municipal app. */
(() => {
 const url='https://xxobbhnhxhcjkdxmjmwj.supabase.co';
 const apikey='sb_publishable_dtvSaFdTJeZ1LAslek8Yjg_PVKGtDZn';
 const key='radar-supabase-session-v1';
 const form=document.querySelector('#login-form');const result=document.querySelector('#login-result');
 if(!form||!result)return;
 if(new URLSearchParams(location.search).get('login')==='1')document.querySelector('[data-login-open]')?.click();
 form.addEventListener('submit',async event=>{
  event.preventDefault();event.stopImmediatePropagation();if(!form.reportValidity())return;
  const values=new FormData(form);const button=form.querySelector('button[type="submit"]');button.disabled=true;result.textContent='Verificando tu acceso…';
  try{
   const response=await fetch(`${url}/auth/v1/token?grant_type=password`,{method:'POST',headers:{apikey,'Content-Type':'application/json'},body:JSON.stringify({email:String(values.get('email')||values.get('username')||'').trim(),password:String(values.get('password')||'')})});
   const payload=await response.json();if(!response.ok)throw new Error(response.status===429?'Espera unos minutos antes de volver a intentar.':'No pudimos iniciar sesión. Revisa tu correo y contraseña.');
   const session={access_token:payload.access_token,refresh_token:payload.refresh_token,expires_at:Date.now()+payload.expires_in*1000,token_type:payload.token_type};
   localStorage.setItem(key,JSON.stringify(session));
   localStorage.setItem('radar-session-persistence',values.get('remember')?'local':'session');
   sessionStorage.setItem('radar-session-tab','active');
   result.textContent='Acceso confirmado. Abriendo RADAR…';const next=new URLSearchParams(location.search).get('next');window.location.assign(next&&/^\/(?:municipio\/\d{4}d?(?:\/[a-z0-9-]+)?|\d{4}d)(?:\?[^#]*)?$/.test(next)?next:'/municipios');
  }catch(error){result.textContent=error.message||'No se pudo conectar. Intenta de nuevo.';button.disabled=false;}
 },true);
})();

