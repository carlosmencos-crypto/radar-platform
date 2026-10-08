import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { OcrError, parseGoogleDocument, processGoogleImage, processorName, validateImage, type GoogleConfig } from '../document-ai-ocr-core.ts';

const origins = new Set(['https://radargt.wowlatam.com','https://fiscales.wowlatam.com']);
const elections = new Set(['PRESIDENTE','CORPORACION_MUNICIPAL','DIP_DIST','DIP_NAC','DIP_PAR']);
const digest = async (value: string | Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value))).map(n=>n.toString(16).padStart(2,'0')).join('');
function config(): GoogleConfig {
  try {
    const credentials = JSON.parse(Deno.env.get('GOOGLE_DOCUMENT_AI_SERVICE_ACCOUNT') ?? '{}');
    const c = { project: Deno.env.get('GOOGLE_DOCUMENT_AI_PROJECT_ID') ?? '', location: Deno.env.get('GOOGLE_DOCUMENT_AI_LOCATION') ?? 'us', processor: Deno.env.get('GOOGLE_DOCUMENT_AI_PROCESSOR_ID') ?? '', version: Deno.env.get('GOOGLE_DOCUMENT_AI_PROCESSOR_VERSION') ?? '', email: credentials.client_email, privateKey: credentials.private_key };
    processorName(c);
    if (!c.email || !c.privateKey) throw new Error('Missing credentials');
    return c;
  } catch { throw new OcrError('Google Document AI aún no está activado. Puedes usar la lectura local.', 503); }
}
Deno.serve(async request => {
  const origin = request.headers.get('origin') ?? '';
  const headers = { 'Access-Control-Allow-Origin': origins.has(origin) ? origin : 'https://radargt.wowlatam.com', 'Access-Control-Allow-Headers': 'apikey, content-type, x-radar-session', 'Access-Control-Allow-Methods': 'POST, OPTIONS', Vary: 'Origin', 'Cache-Control': 'no-store', 'Content-Type': 'application/json' };
  const reply = (body: unknown, status=200) => new Response(JSON.stringify(body), {status,headers});
  if (!origins.has(origin)) return reply({error:'Origen no permitido.'},403);
  if (request.method==='OPTIONS') return new Response(null,{status:204,headers});
  if (request.method!=='POST') return reply({error:'Método no permitido.'},405);
  const service = createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  let jobId: string | undefined;
  try {
    const secret = request.headers.get('x-radar-session') ?? '';
    if (!/^[a-f0-9]{64}$/.test(secret)) throw new OcrError('Acceso fiscal requerido.',401);
    const {data:s,error:sessionError}=await service.from('day_d_fiscal_sessions').select('*').eq('session_hash',await digest(secret)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
    if(sessionError || !s) throw new OcrError('La sesión venció o fue revocada.',401);
    if(s.user_agent_hash && s.user_agent_hash!==await digest(request.headers.get('user-agent')??'')) throw new OcrError('Acceso vinculado a otro dispositivo.',401);
    const [{data:g,error:ge},{data:a,error:ae},{data:c,error:ce}]=await Promise.all([
      service.from('day_d_fiscal_access_grants').select('*').eq('id',s.access_grant_id).maybeSingle(),
      service.from('day_d_jrv_assignments').select('*').eq('id',s.assignment_id).maybeSingle(),
      service.from('campaigns').select('id,is_demo,status').eq('id',s.campaign_id).maybeSingle(),
    ]);
    if(ge||ae||ce||!g||!a||!c||g.status!=='ACTIVE'||g.revoked_at||!a.active||c.status!=='active'||!(Date.parse(g.expires_at)>Date.now())) throw new OcrError('El acceso ya no está activo.',401);
    if(g.assignment_id!==a.id||g.campaign_id!==c.id||a.campaign_id!==c.id||a.is_demo!==c.is_demo||g.demo_mode!==c.is_demo||g.municipality_code!==a.municipality_code||s.municipality_code!==a.municipality_code) throw new OcrError('El alcance del acceso no es válido.',403);
    const google=config();
    const {data:budget,error:be}=await service.from('radar_ocr_budget').select('enabled,demo_only').eq('id',true).single();
    if(be||!budget?.enabled||(budget.demo_only&&!c.is_demo)) throw new OcrError('La lectura Google todavía no está habilitada para esta campaña.',503);
    if(Number(request.headers.get('content-length')??0)>13*1024*1024) throw new OcrError('La fotografía supera el límite permitido.',413);
    const form=await request.formData();
    const file=form.get('file');
    const election=String(form.get('electionType')??'');
    if(!(file instanceof File)||!elections.has(election)) throw new OcrError('Fotografía y elección requeridas.',400);
    const bytes=new Uint8Array(await file.arrayBuffer()); validateImage(bytes,file.type);
    const scope=c.is_demo||g.test_mode?'TSE2023':c.id;
    const {data:catalog,error:catalogError}=await service.from('day_d_election_options').select('option_code,option_label,catalog_version').eq('scope_key',scope).eq('election_type',election).eq('active',true).order('sort_order');
    if(catalogError||!catalog?.length) throw new OcrError('No hay catálogo autorizado para esta elección.',409);
    const hash=await digest(`${await digest(bytes)}:${processorName(google)}:${JSON.stringify(catalog)}:parser-v1`);
    const {data:reservation,error:re}=await service.rpc('radar_ocr_reserve_v1',{p_campaign:c.id,p_assignment:a.id,p_demo:c.is_demo,p_test:g.test_mode===true,p_election:election,p_hash:hash});
    if(re) throw new OcrError('No se pudo comprobar el cupo de lectura.');
    if(reservation.state==='COMPLETE') return reply({...reservation.result,cached:true});
    if(reservation.state!=='RESERVED') throw new OcrError(['LIMIT','RATE_LIMIT'].includes(reservation.state)?'Se alcanzó el límite de lecturas del piloto. Puedes continuar manualmente.':'Esta lectura no está disponible o ya fue solicitada. Puedes continuar manualmente.',429);
    jobId=reservation.id;
    const document=await processGoogleImage(google,bytes,file.type);
    const result={...parseGoogleDocument(document,catalog.map(o=>({code:o.option_code,label:o.option_label}))),isDemo:c.is_demo,isTest:g.test_mode===true,assignmentId:a.id,electionType:election,catalogVersion:catalog[0].catalog_version};
    const {error:saveError}=await service.from('radar_ocr_jobs').update({status:'COMPLETE',result}).eq('id',jobId).eq('status','PENDING');
    if(saveError) throw new OcrError('No se pudo conservar la lectura. Revisa el acta manualmente.');
    return reply({...result,cached:false});
  } catch(error) {
    if(jobId) await service.from('radar_ocr_jobs').update({status:'FAILED'}).eq('id',jobId).eq('status','PENDING');
    // Never log Google response bodies, tokens, raw actas or service-account credentials.
    return reply({error:error instanceof OcrError?error.message:'No se pudo leer el acta. Puedes continuar manualmente.'},error instanceof OcrError?error.status:503);
  }
});
