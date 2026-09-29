import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import { SYSTEM, redact, contextSummary } from '../supabase/functions/radar-ai/prompt.ts';
const source=fs.readFileSync(new URL('../supabase/functions/radar-ai/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
const code=stripTypeScriptTypes(source);
async function harness(body,opts={}){
 let handler,providerCalls=0;const rpcCalls=[];
 const service={auth:{getUser:async()=>({data:{user:opts.invalid?null:{id:'actor',app_metadata:{platform_role:opts.admin?'super_admin':'member'}}},error:opts.invalid?{}:null})},rpc:async(name,args)=>{rpcCalls.push({name,args});return {data:name==='radar_ai_reserve_v1'?{allowed:!opts.quota,id:'ticket'}:name==='radar_ai_usage_v1'?{tokens:0}:{},error:null};}};
 const user={rpc:async()=>({data:[{campaign_id:'campaign',is_demo:false,municipality_name:'Test'}],error:null})};let clients=0;
 const scope={SYSTEM,redact,contextSummary,Request,Response,TextEncoder,AbortSignal,JSON,atob,Set,console,
 createClient:()=>clients++===0?service:user,
 Deno:{env:{get:n=>n==='GROQ_API_KEY'?(opts.noKey?undefined:'test-key'):'test-env'},serve:f=>handler=f},
 fetch:async()=>{providerCalls++;if(opts.timeout)throw new Error('timeout');return new Response(JSON.stringify({choices:[{message:{content:'Respuesta administrativa'}}],usage:{prompt_tokens:100,completion_tokens:50}}),{status:200});}};
 vm.runInNewContext(code,scope);
 const jwt='e30.'+Buffer.from(JSON.stringify({aal:opts.aal||'aal2'})).toString('base64url')+'.sig';
 const res=await handler(new Request('https://test',{method:'POST',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 return {status:res.status,payload:await res.json(),providerCalls,rpcCalls};
}
const body={action:'chat',campaign_id:'campaign',municipality_code:'0509',is_demo:false,prompt:'Organiza documentos',context:'Resumen'};
test('valid campaign calls provider and records actual tokens',async()=>{const r=await harness(body);assert.equal(r.status,200);assert.equal(r.providerCalls,1);assert.equal(r.rpcCalls.at(-1).args.p_input,100);});
test('invalid session never reaches provider',async()=>{const r=await harness(body,{invalid:true});assert.equal(r.status,401);assert.equal(r.providerCalls,0);});
test('another campaign and real/demo mismatch never reach provider',async()=>{for(const change of [{campaign_id:'other'},{is_demo:true}]){const r=await harness({...body,...change});assert.equal(r.status,403);assert.equal(r.providerCalls,0);}});
test('quota exhaustion prevents provider calls',async()=>{const r=await harness(body,{quota:true});assert.equal(r.status,429);assert.equal(r.providerCalls,0);});
test('usage requires superadmin and MFA',async()=>{for(const opts of [{},{admin:true,aal:'aal1'}]){const r=await harness({action:'usage'},opts);assert.equal(r.status,403);}assert.equal((await harness({action:'usage'},{admin:true})).status,200);});
test('timeout keeps conservative reservation',async()=>{const r=await harness(body,{timeout:true});assert.equal(r.status,503);assert.equal(r.rpcCalls.at(-1).args.p_status,'uncertain');});
test('direct identifiers redacted and context bounded',()=>{assert.ok(!redact('test@example.com DPI 1234 56789 0101').includes('example'));assert.ok(!redact('test@example.com DPI 1234 56789 0101').includes('1234'));assert.ok(contextSummary('a'.repeat(30000)).length<=5000);});
