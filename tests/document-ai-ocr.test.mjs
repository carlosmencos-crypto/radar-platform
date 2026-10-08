import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGoogleDocument, validateImage, processorName, processGoogleImage, anchorText } from '../supabase/functions/document-ai-ocr-core.ts';
const options=[{code:'A',label:'Partido Uno · Candidato Uno'},{code:'B',label:'Partido Dos · Candidato Dos'}];
function doc(lines, quality=1) {
 let text='', layouts=[];
 for(const line of lines) {const start=Array.from(text).length; text+=line+'\n';layouts.push({layout:{confidence:.97,textAnchor:{textSegments:[{startIndex:start,endIndex:Array.from(text).length}]}}});}
 return {text,pages:[{lines:layouts,imageQualityScores:{qualityScore:quality}}]};
}
test('suggests exact unique rows including zero, never writes votes',()=>{
 const r=parseGoogleDocument(doc(['Partido Uno 0','Partido Dos 123']),options);
 assert.deepEqual(r.suggestions.map(x=>x.value),['0','123']);assert.equal(r.requiresHumanReview,true);assert.equal(r.validVotes,'');
});
test('does not assign a nearby number or reuse 2023 order',()=>{
 assert.equal(parseGoogleDocument(doc(['Partido Uno','123','Partido Dos 5 9']),options).suggestions.length,0);
});
test('ambiguous duplicate rows and shared labels stay empty',()=>{
 assert.equal(parseGoogleDocument(doc(['Partido Uno 1','Partido Uno 2']),options).suggestions.length,0);
 assert.equal(parseGoogleDocument(doc(['Partido Uno 1']),[options[0],{code:'X',label:'Partido Uno · Otro candidato'}]).suggestions.length,0);
});
test('low quality and low confidence cannot prefill; defects are visible',()=>{
 const d=doc(['Partido Uno 7'],.2); d.pages[0].imageQualityScores.detectedDefects=[{type:'quality/defect_blurry',confidence:.9}];
 const r=parseGoogleDocument(d,options); assert.equal(r.suggestions.length,0);assert.ok(r.warnings.some(w=>w.includes('borrosa')));
 const low=doc(['Partido Uno 7']);low.pages[0].lines[0].layout.confidence=.2;assert.equal(parseGoogleDocument(low,options).suggestions.length,0);
});
test('multiple pages do not silently merge election figures',()=>{
 const d=doc(['Partido Uno 7']);d.pages.push(d.pages[0]);assert.equal(parseGoogleDocument(d,options).suggestions.length,0);
});
test('unicode text anchors preserve accents and supplementary characters',()=>assert.equal(anchorText('A😀José',{textSegments:[{startIndex:2,endIndex:6}]}),'José'));
test('MIME spoofing, multipage PDFs and large files rejected',()=>{
 assert.throws(()=>validateImage(new Uint8Array([37,80,68,70]),'image/jpeg'));
 assert.throws(()=>validateImage(new Uint8Array([37,80,68,70]),'application/pdf'));
 assert.throws(()=>validateImage(new Uint8Array(13*1024*1024),'image/png'));
 validateImage(new Uint8Array([255,216,255,224]),'image/jpeg');
});
test('processor endpoint cannot be injected; version required',()=>{
 const c={project:'radar-pilot',location:'us',processor:'abc',version:'pretrained-ocr-v2.1-2024-08-07'};
 assert.match(processorName(c),/processorVersions/);
 assert.throws(()=>processorName({...c,location:'evil.example/'}));
 assert.throws(()=>processorName({...c,version:''}));
});
test('signed OAuth exchange and one-page Google request, no paid extras or retry',async()=>{
 const kp=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const pk=Buffer.from(await crypto.subtle.exportKey('pkcs8',kp.privateKey)).toString('base64');
 const config={project:'radar-pilot',location:'us',processor:'abc',version:'v1',email:'unit@radar-pilot.iam.gserviceaccount.com',privateKey:`-----BEGIN PRIVATE KEY-----\n${pk}\n-----END PRIVATE KEY-----`};
 let calls=0;
 const fake=async(url,init)=>{
  calls++;
  if(url.includes('oauth2')) {
   const jwt=init.body.get('assertion').split('.');
   const ok=await crypto.subtle.verify('RSASSA-PKCS1-v1_5',kp.publicKey,Buffer.from(jwt[2],'base64url'),new TextEncoder().encode(jwt.slice(0,2).join('.')));
   assert.equal(ok,true);return Response.json({access_token:'test-token',expires_in:3600});
  }
  assert.equal(init.headers.Authorization,'Bearer test-token');
  const body=JSON.parse(init.body);assert.deepEqual(body.processOptions.individualPageSelector.pages,[1]);assert.equal(body.processOptions.ocrConfig.enableImageQualityScores,true);assert.equal(body.processOptions.ocrConfig.premiumFeatures,undefined);
  return Response.json({document:doc(['Partido Uno 3'])});
 };
 await processGoogleImage(config,new Uint8Array([255,216,255,224]),'image/jpeg',fake);assert.equal(calls,2);
 let attempts=0;await assert.rejects(()=>processGoogleImage(config,new Uint8Array([255,216,255,224]),'image/jpeg',async()=>{attempts++;return new Response('private detail',{status:429})}),/ocupado/);assert.equal(attempts,1);
});
