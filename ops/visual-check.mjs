import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import {spawn,execSync} from 'node:child_process';
import fs from 'node:fs';
const root=process.argv[2];
fs.copyFileSync('recovery-source/ops/preview.tsx',root+'/oct08-preview.tsx');
fs.writeFileSync(root+'/oct08-preview.html','<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/team-access-v2.css"></head><body><div id="root"></div><script type="module" src="/oct08-preview.tsx"></script></body></html>');
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4190'],{cwd:root,stdio:'ignore'});
fs.mkdirSync('visual-oct08',{recursive:true});
let browser;
try {
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:4190/oct08-preview.html');break}catch{} await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:execSync('which google-chrome').toString().trim(),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const kind of ['notice','resource']) {
  await page.goto('http://127.0.0.1:4190/oct08-preview.html?'+kind);
  await page.getByRole('button',{name:kind==='resource'?'+ Subir documento':'+ Crear aviso',exact:true}).click();
  await page.getByRole('button',{name:'Municipios demo Solo demostraciones'}).click();
  await page.locator('select[name=municipality_code]').selectOption('0501');
  if(await page.locator('[name=target_environment]').inputValue()!=='DEMO')throw Error('Demo selection missing');
  await page.locator('.content-audience').screenshot({path:`visual-oct08/${kind}-desktop.png`});
  if(kind==='notice'){
   await page.locator('[name=title]').fill('Prueba local');await page.locator('[name=body]').fill('Sin publicación');await page.locator('[name=ends_at]').fill('2026-12-31T10:00');
   await page.getByRole('button',{name:'Guardar borrador'}).click();
   const sent=await page.evaluate(()=>window.__submitted[0]);
   if(sent.input.target_environment!=='DEMO'||sent.input.municipality_code!=='0501')throw Error('Incorrect submitted audience');
  }
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.content-audience').screenshot({path:'visual-oct08/audience-mobile.png'});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Mobile horizontal overflow');
 const logo='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" rx="100" fill="#08566b"/><text x="100" y="120" text-anchor="middle" font-family="Arial" font-size="56" fill="white">TEST</text></svg>');
 await page.route('**/src/components/useV70CampaignBrand.ts',route=>route.fulfill({contentType:'application/javascript',body:`export function useV70CampaignBrand(){return {identity:{party_logo_data_url:${JSON.stringify(logo)},party_name:'Logo de prueba'}}}`}));
 for(const demo of [false,true]) {
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:1000});
   await page.goto('http://127.0.0.1:4190/oct08-preview.html?sheet=1'+(demo?'&demo=1':''));
   const img=page.locator('.resource-sheet-heading>img');await img.waitFor();
   const box=await img.boundingBox();if(box.width!==(width===1440?120:80))throw Error('Unexpected logo size: '+box.width);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Resource horizontal overflow');
   await page.locator('.resource-sheet').screenshot({path:`visual-oct08/resource-${demo?'demo':'real'}-${width}.png`});
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('VISUAL_AUDIENCE_AND_RESOURCE_LOGO_OK');
}finally{await browser?.close();server.kill()}
