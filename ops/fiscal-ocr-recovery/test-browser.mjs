import { chromium } from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import http from 'node:http';
import assert from 'node:assert/strict';
const base=process.argv[2];
let code=fs.readFileSync(`${base}/fixed-entry.js`,'utf8');
const mount='(0,S.createRoot)(yt).render((0,N.jsx)(x.StrictMode,{children:(0,N.jsx)(vt,{})}));';
assert.equal(code.split(mount).length,2);
code=code.replace(mount,'');
code=code.replace('async function re(e){return T', 'async function re(e){await new Promise(r=>setTimeout(r,800));return T');
code+='\nexport {_t as TestRtd,x as React,S as ReactDOM,D as saveDraft,re as loadDraft};';
const fixtureHtml=`<div id="root"></div><div id="test"></div><script type="module">
import {TestRtd,React,ReactDOM,saveDraft,loadDraft} from '/test-entry.js';
window.loadDraft=loadDraft;window.saveDraft=saveDraft;
window.assignment='demo-a';window.elections=[{type:'PRESIDENTE',label:'Presidencia',catalogMode:'DEMOSTRACION',catalogVersion:'QA',options:[{code:'QA',label:'PARTIDO QA'}]}];
const root=ReactDOM.createRoot(document.getElementById('test'));
window.renderRtd=()=>root.render(React.createElement(React.StrictMode,null,React.createElement(TestRtd,{assignmentId:window.assignment,elections:structuredClone(window.elections),folios:[],onSaveDraft:async()=>"local",onSubmit:async()=>{throw Error('No transmission in QA')}})));
window.renderRtd();
</script>`;
const ocrMock=`export default {createWorker: async()=>{ window.ocrCalls=(window.ocrCalls||0)+1;
const saved=await window.loadDraft('rtd-'+window.assignment+'-PRESIDENTE-QA');if(!saved?.actFile) throw Error('PHOTO_NOT_DURABLE');
if(window.ocrCalls===1)throw Error('Simulated cold-start failure');
return {recognize:async()=>({data:{text:'PARTIDO QA 42',confidence:98}}),terminate:async()=>{},setParameters:async()=>{}};
}};`;
const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/test-entry.js'||req.url==='/src-CA_4_WxC.js'?'text/javascript':'text/html');res.end(req.url==='/test-entry.js'?code:req.url==='/src-CA_4_WxC.js'?ocrMock:fixtureHtml)}).listen(4192,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 for(const width of [1440,390]) {
  const context=await browser.newContext({viewport:{width,height:950}});const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));let navigation=0;page.on('framenavigated',f=>{if(f===page.mainFrame())navigation++});
  await page.goto('http://127.0.0.1:4192');await page.getByRole('button',{name:'Leer fotografía',exact:true}).waitFor();
  const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=500;c.height=700;const x=c.getContext('2d');x.fillStyle='white';x.fillRect(0,0,500,700);x.fillStyle='black';x.font='24px sans-serif';x.fillText('PARTIDO QA 42',50,150);return c.toDataURL('image/png').split(',')[1]});
  await page.waitForFunction(()=>!document.querySelector('#test input[type=file]')?.disabled);
  await page.locator('#test input[type=file]').last().setInputFiles({name:'acta-qa.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.getByText('No se pudo completar la lectura. La fotografía sigue cargada:',{exact:false}).waitFor();
  assert.equal(navigation,1,'OCR must not navigate');
  assert.equal(await page.evaluate(()=>window.ocrCalls),1);
  assert.equal(await page.evaluate(async()=>!!(await loadDraft('rtd-demo-a-PRESIDENTE-QA'))?.actFile),true);
  await page.evaluate(()=>renderRtd()); // freshly allocated election data must not wipe the draft
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.getByText('Lectura terminada',{exact:false}).waitFor();
  assert.equal(await page.evaluate(()=>window.ocrCalls),2);assert.equal(navigation,1);
  await page.reload();await page.getByRole('button',{name:'Leer fotografía',exact:true}).waitFor();
  await page.waitForFunction(()=>!document.querySelector('#test .fiscal-ocr-box button')?.disabled && [...document.querySelectorAll('#test img')].some(i=>i.src.startsWith('blob:')));
  assert.equal(await page.evaluate(async()=>!!(await loadDraft('rtd-demo-a-PRESIDENTE-QA'))?.actFile),true);
  await page.evaluate(()=>{window.assignment='real-b';renderRtd()});
  await page.waitForFunction(()=>[...document.querySelectorAll('#test button')].find(b=>b.textContent==='Leer fotografía')?.disabled);
  assert.equal(await page.evaluate(async()=>!!(await loadDraft('rtd-real-b-PRESIDENTE-QA'))?.actFile),false);
  assert.equal(await page.evaluate(async()=>!!(await loadDraft('rtd-demo-a-PRESIDENTE-QA'))?.actFile),true);
  assert.deepEqual(errors,[]);
  console.log('OCR_FAILURE_RETRY_RELOAD_SCOPE_OK',width);
  await context.close();
 }
} finally {await browser.close();server.close();}
