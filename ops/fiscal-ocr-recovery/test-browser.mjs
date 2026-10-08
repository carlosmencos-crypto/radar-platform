import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
const base=process.argv[2],mods=JSON.parse(fs.readFileSync(`${base}/ocr-modules.json`));
const initial=fs.readFileSync(`${base}/test-assets/assets/index-ocr-recovery-6aac8125256b9ee7.js`,'utf8'),fixed=fs.readFileSync(`${base}/fixed-entry.js`,'utf8');
const bootstrap=(assignment='demo-a')=>({fiscal:{id:1,fullName:'FISCAL QA'},campaign:{name:'PRUEBA AISLADA',partyName:'QA',partyLogoUrl:'/blank.svg',municipality:'MUNICIPIO QA',municipalityCode:assignment==='demo-a'?'0509d':'0509'},assignment:{id:assignment,centerName:'CENTRO QA',jrvNumber:123},centerOverview:null,counts:{incidents:0,rtdSubmitted:0},session:{demoMode:assignment==='demo-a'},incidents:[],folios:[],elections:[{type:'CORPORACION_MUNICIPAL',label:'Alcaldía',catalogMode:'DEMOSTRACION',catalogVersion:'QA',options:[{code:'QA',label:'PARTIDO QA'}]},{type:'PRESIDENTE',label:'Presidencia',catalogMode:'DEMOSTRACION',catalogVersion:'QA',options:[{code:'QA',label:'PARTIDO QA'}]}]});
const html=(mode)=>`<html><body><div id="root"></div><script>window.__RADAR_FISCAL_CONFIG__={apiBase:'/mock'};</script><script type="module" src="/${mode}-entry.js"></script></body></html>`;
let blockedWrites=0;
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://localhost').pathname;
 if(req.method!=='GET'){blockedWrites++;res.writeHead(403);res.end('QA cannot transmit');return}
 let body,type='text/javascript';
 if(pathname==='/baseline-entry.js')body=initial;
 else if(pathname==='/fixed-entry.js')body=fixed;
 else if(pathname==='/src-CA_4_WxC.js')body=fs.readFileSync(`${base}/ocr-original.js`);
 else if(pathname==='/index-DACKz-qw.js')body=fs.readFileSync(`${base}/test-assets/assets/index-DACKz-qw.js`);
 else if(Object.values(mods).includes(pathname.slice(1)))body=fs.readFileSync(`${base}/${pathname.slice(1)}`);
 else if(pathname==='/fiscales/sw.js')body='self.addEventListener("install",()=>self.skipWaiting());self.addEventListener("activate",event=>event.waitUntil(self.clients.claim()));';
 else if(pathname.startsWith('/fiscales/ocr/')){
  const file=path.join(base,'test-assets',pathname.slice('/fiscales/'.length));
  if(!fs.existsSync(file)){res.writeHead(404);res.end('missing '+pathname);return}
  body=fs.readFileSync(file);type=pathname.endsWith('.wasm')?'application/wasm':pathname.endsWith('.gz')?'application/octet-stream':'text/javascript';
 }else if(pathname==='/mock/api/fiscal/bootstrap'){type='application/json';body=JSON.stringify(bootstrap())}
 else if(pathname==='/baseline'||pathname==='/fixed'){type='text/html';body=html(pathname.slice(1))}
 else {res.writeHead(404);res.end('not found');return}
 res.setHeader('Content-Type',type);res.end(body);
}).listen(4192,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const url='http://127.0.0.1:4192';
async function ready(page){await page.waitForFunction(()=>document.querySelector('#rtd input[type=file]')?.disabled===false)}
async function photo(page){return Buffer.from(await page.evaluate(()=>{let c=document.createElement('canvas');c.width=1000;c.height=1400;let g=c.getContext('2d');g.fillStyle='white';g.fillRect(0,0,1000,1400);g.fillStyle='black';g.font='bold 48px sans-serif';g.fillText('PARTIDO QA 42',150,300);return c.toDataURL('image/png').split(',')[1]}),'base64')}
async function upload(page){await ready(page);await page.locator('#rtd input[type=file]').last().setInputFiles({name:'acta-qa.png',mimeType:'image/png',buffer:await photo(page)});await page.waitForFunction(()=>{let b=[...document.querySelectorAll('#rtd button')].find(b=>b.textContent==='Leer fotografía');return b&&!b.disabled})}
async function readDraft(page,key){return page.evaluate(key=>new Promise((resolve,reject)=>{const q=indexedDB.open('radar-fiscal-dia-d',1);q.onsuccess=()=>{const db=q.result,tx=db.transaction('drafts'),r=tx.objectStore('drafts').get(key);r.onsuccess=()=>resolve(!!r.result?.value?.actFile);tx.oncomplete=()=>db.close()};q.onerror=()=>reject(q.error)}),key)}
try{
 // Reproduce the actual bug with deployed entry + real lazy module dependency graph.
 {
  const context=await browser.newContext();const page=await context.newPage();let boots=0;
  page.on('request',r=>{if(r.url().endsWith('/api/fiscal/bootstrap'))boots++});
  await page.route('**/fiscales/ocr/**',r=>r.abort()); // reproduction needs import side effect, not OCR compute
  await page.goto(url+'/baseline');await upload(page);assert.equal(boots,1);
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('#rtd img[src^="blob:"]'));
  await ready(page);assert.equal(boots,2,'Baseline must reproduce obsolete entry remount');
  assert.equal(await page.getByRole('button',{name:'Leer fotografía',exact:true}).isDisabled(),true);
  console.log('BASELINE_REAL_OCR_IMPORT_REPRODUCES_PORTAL_RESTART_AND_PHOTO_LOSS');await context.close();
 }
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage();let boots=0,legacy=0;const errors=[];
  page.on('request',r=>{if(r.url().endsWith('/api/fiscal/bootstrap'))boots++;if(r.url().includes('index-DACKz'))legacy++});page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url+'/fixed');await ready(page);
  await page.locator('#rtd select').first().selectOption('PRESIDENTE');await upload(page);
  // This uses the actual deployed worker, WASM and Spanish trained data, with an empty cache.
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.getByText('Lectura terminada',{exact:false}).waitFor({timeout:120000});
  assert.equal(boots,1);assert.equal(legacy,0);assert.equal(await readDraft(page,'rtd-demo-a-PRESIDENTE-QA'),true);
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.waitForFunction(()=>{const b=[...document.querySelectorAll('#rtd button')].find(b=>b.textContent==='Leer fotografía');return b&&!b.disabled});
  assert.equal(boots,1);assert.equal(legacy,0);
  // Reload while the next OCR worker initializes; selection + photo must recover together.
  await page.getByRole('button',{name:'Leer fotografía',exact:true}).click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('radar-fiscal-work-v2-demo-a')||'null')?.phase==='reading');
  await page.reload();await ready(page);
  assert.equal(await page.locator('#rtd select').first().inputValue(),'PRESIDENTE');
  await page.getByText('Recuperamos tu acta.',{exact:false}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Leer fotografía',exact:true}).isDisabled(),false);
  assert.equal(await readDraft(page,'rtd-demo-a-PRESIDENTE-QA'),true);
  await page.locator('#rtd select').first().selectOption('CORPORACION_MUNICIPAL');await ready(page);
  assert.equal(await page.getByRole('button',{name:'Leer fotografía',exact:true}).isDisabled(),true,'Election photo must not leak');
  // Fresh verified assignment never inherits demo photograph or election selection.
  await page.route('**/mock/api/fiscal/bootstrap',r=>r.fulfill({json:bootstrap('real-b')}));await page.reload();await ready(page);
  assert.equal(await page.locator('#rtd select').first().inputValue(),'CORPORACION_MUNICIPAL');
  assert.equal(await readDraft(page,'rtd-real-b-PRESIDENTE-QA'),false);assert.equal(await readDraft(page,'rtd-demo-a-PRESIDENTE-QA'),true);
  assert.deepEqual(errors,[]);console.log('REAL_ENGINE_COLD_WARM_RELOAD_ELECTION_AND_SCOPE_OK',width);await context.close();
 }
 assert.equal(blockedWrites,0,'Tests never transmit actas or results');
}finally{await browser.close();server.close()}
