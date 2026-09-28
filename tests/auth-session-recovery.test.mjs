import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const source=stripTypeScriptTypes(readFileSync(new URL('../src/data/radarAuth.ts',import.meta.url),'utf8').replaceAll('import.meta.env','({VITE_SUPABASE_URL:"https://example.invalid",VITE_SUPABASE_PUBLISHABLE_KEY:"public-test"})'));
function storage(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),removeItem:k=>map.delete(k)};}
const key='radar-supabase-session-v1';
test('session recovery retains transient failures and coalesces renewal',async()=>{
 const previousWindow=globalThis.window,previousFetch=globalThis.fetch;
 globalThis.window={localStorage:storage(),sessionStorage:storage()};
 const expired={access_token:'test-old',refresh_token:'test-refresh',expires_at:0};
 const auth=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 try {
 window.localStorage.setItem(key,JSON.stringify(expired));
 globalThis.fetch=async()=>{throw new Error('offline')};
 await assert.rejects(auth.ensureRadarAccessToken(),/conexión/);
 assert.ok(window.localStorage.getItem(key),'offline must retain credentials');
 let calls=0;
 globalThis.fetch=async()=>{calls++;return {ok:true,json:async()=>({access_token:'test-new',refresh_token:'test-next',expires_in:3600})}};
 assert.deepEqual(await Promise.all([auth.ensureRadarAccessToken(),auth.ensureRadarAccessToken()]),['test-new','test-new']);
 assert.equal(calls,1);assert.equal(window.sessionStorage.getItem('radar-session-tab'),'1');
 window.localStorage.setItem(key,JSON.stringify(expired));
 globalThis.fetch=async()=>({ok:false,status:429});
 await assert.rejects(auth.ensureRadarAccessToken(),/conexión/);assert.ok(window.localStorage.getItem(key));
 globalThis.fetch=async()=>({ok:false,status:400});
 await assert.rejects(auth.ensureRadarAccessToken(),/RADAR_AUTH_REQUIRED/);assert.equal(window.localStorage.getItem(key),null);
 window.location={pathname:'/admin/avisos',search:''};
 globalThis.fetch=async()=>({ok:true,json:async()=>({access_token:'admin-token',refresh_token:'admin-refresh',expires_in:3600})});
 await auth.signInRadar('test@example.invalid','test-only');
 assert.equal(auth.readRadarSession().access_token,'admin-token');
 window.location={pathname:'/acceso',search:''};
 assert.equal(auth.readRadarSession(),null);
 globalThis.fetch=async()=>({ok:true,json:async()=>({access_token:'municipal-token',refresh_token:'municipal-refresh',expires_in:3600})});
 await auth.signInRadar('test@example.invalid','test-only');
 window.location={pathname:'/admin/demos',search:''};
 assert.equal(auth.readRadarSession().access_token,'admin-token','municipal login must not replace admin MFA session');
 }finally{globalThis.window=previousWindow;globalThis.fetch=previousFetch;}
});
