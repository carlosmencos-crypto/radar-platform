import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('./access-gate.js',import.meta.url),'utf8').replace('await import(entry)','globalThis.appLoaded=true');
async function mount(path='/municipio/0509',signedIn=true){
 const key='radar-supabase-session-v1';
 const local=new Map(signedIn?[[key,JSON.stringify({access_token:'fixture',expires_at:Date.now()+3600000})],['radar-session-persistence','local']]:[]);
 const session=new Map([['radar-session-tab','active'],['radar-supabase-callback-v1','fixture']]);
 const listeners={},destinations=[],calls=[];
 class Element{constructor(label,href){this.textContent=label;this.href=href;}closest(){return this;}getAttribute(name){return name==='href'?this.href:null;}}
 const ctx={Element,URLSearchParams,Date,console,localStorage:{getItem:k=>local.get(k),removeItem:k=>local.delete(k)},sessionStorage:{getItem:k=>session.get(k),removeItem:k=>session.delete(k)},location:{pathname:path,search:'',replace:to=>destinations.push(to),reload(){}},document:{addEventListener:(type,handler,capture)=>{listeners[type]={handler,capture};},body:{replaceChildren(){throw new Error('Unexpected access error')}}},window:{addEventListener(){}},fetch:(url,options)=>{calls.push({url,options});if(url.endsWith('/logout'))return new Promise(()=>{});return Promise.resolve({ok:true,json:async()=>[{campaign_id:'fixture'}]});}};
 await vm.runInNewContext('(async()=>{'+source+'})()',ctx);
 return {ctx,local,session,listeners,destinations,calls,Element};
}
for(const [path,label,href] of [['/municipio/0509','Cerrar sesión','/signout-with-chatgpt?return_to=%2F'],['/municipio/1901/configuracion','Cerrar sesión',null],['/0101d','Cerrar sesión',null],['/municipio/0101','↪ Cerrar sesión','/signout-with-chatgpt?return_to=%2Flogin']]){
 test(`logout immediately returns ${path} to plain landing while revocation remains pending`,async()=>{
 const s=await mount(path);assert.equal(s.ctx.appLoaded,true);let prevented=false,stopped=false;
 const event={target:new s.Element(label,href),preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}};
 s.listeners.click.handler(event);
 assert.equal(s.listeners.click.capture,true);assert.ok(prevented&&stopped);
 assert.deepEqual(s.destinations,['/']);assert.equal(s.local.size,0);assert.equal(s.session.size,0);
 assert.equal(s.calls.at(-1).options.keepalive,true);
 s.listeners.click.handler(event);assert.deepEqual(s.destinations,['/']);
 });
}
test('unauthenticated municipal route remains protected',async()=>{const s=await mount('/municipio/0509',false);assert.equal(s.ctx.appLoaded,undefined);assert.match(s.destinations[0],/^\/\?login=1&next=/);});
test('unrelated button does not revoke or navigate',async()=>{const s=await mount();s.listeners.click.handler({target:new s.Element('Guardar',null)});assert.deepEqual(s.destinations,[]);assert.ok(s.local.size);});
