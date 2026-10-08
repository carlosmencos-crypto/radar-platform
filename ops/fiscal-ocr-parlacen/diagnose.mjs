import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import fs from 'node:fs';import http from 'node:http';import path from 'node:path';
const dir=process.env.FISCAL_ENTRY?'ops/fiscal-ocr-recovery':'ops/fiscal-ocr-parlacen',fixtureDir='ops/fiscal-ocr-parlacen',assets='ops/fiscal-ocr-recovery/test-assets';
let code=fs.readFileSync(process.env.FISCAL_ENTRY||dir+'/entry.js','utf8');
const mount='(0,S.createRoot)(yt).render((0,N.jsx)(x.StrictMode,{children:(0,N.jsx)(vt,{})}));';
if(!code.includes(mount))throw Error('Unexpected live entry');code=code.replace(mount,'')+'\nexport {Qe as read,Se as prepare,le as orders};';
const fixture=Buffer.from(fs.readFileSync(fixtureDir+'/parlacen-votes-fixture.b64','utf8'),'base64');
const server=http.createServer((req,res)=>{let p=new URL(req.url,'http://localhost').pathname;let b,type='text/javascript';if(p==='/') {type='text/html';b='<div id="root"></div><script type="module">import{read,prepare,orders}from"/entry.js";window.ocr={read,prepare,orders};</script>'}
 else if(p==='/entry.js')b=code;else if(p==='/fixture.jpg'){b=fixture;type='image/jpeg'}
 else {const file=p.startsWith('/fiscales/ocr/')?path.join(assets,p.slice('/fiscales/'.length)):path.join(dir,path.basename(p));if(!fs.existsSync(file)){res.writeHead(404);res.end();return}b=fs.readFileSync(file);if(p.endsWith('.gz'))type='application/octet-stream';if(p.endsWith('.wasm'))type='application/wasm'}res.setHeader('Content-Type',type);res.end(b)}).listen(4193,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{const page=await browser.newPage();page.on('pageerror',e=>console.log('PAGE_ERROR',e.stack));await page.goto('http://127.0.0.1:4193');await page.waitForFunction(()=>window.ocr);
const result=await page.evaluate(async()=>{try{const f=new File([await(await fetch('/fixture.jpg')).blob()],'acta.jpg',{type:'image/jpeg'});const p=await ocr.prepare(f);const result=await ocr.read(p.file,'DIP_PAR',ocr.orders.DIP_PAR.map(code=>({code,label:code})),()=>{},'SIMULACION_TSE_2023');return{ok:true,result:{mode:result.mode,suggestions:result.suggestions,controls:result.controls.map(({preview,...c})=>c),warnings:result.warnings}}}catch(e){return{ok:false,message:e.message,stack:e.stack}}});console.log('PARLACEN_RESULT',JSON.stringify(result));
if(process.env.EXPECT_SUCCESS==='1'&&!result.ok)throw Error(result.message);
}finally{await browser.close();server.close()}
