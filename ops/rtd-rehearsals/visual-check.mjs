import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import {spawn,execSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2];
fs.copyFileSync('recovery-source/ops/rtd-rehearsals/preview.tsx',root+'/rtd-preview.tsx');
fs.writeFileSync(root+'/rtd-preview.html','<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/rtd-preview.tsx"></script></body></html>');
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4190'],{cwd:root,stdio:'ignore'});
fs.mkdirSync('visual-rtd',{recursive:true});
let browser;
try {
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:4190/rtd-preview.html');break}catch{} await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:execSync('which google-chrome').toString().trim(),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4190/')?route.continue():route.abort());
 await page.route('**/src/admin/radarAdminApi.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 export async function runAdminAction(action,input){
 window.__lastRtd={action,input}; const active=input.data_mode==='TEST'&&input.election_cycle===2023;
 return {generated_at:new Date().toISOString(),environment:input.data_mode,summary:{fiscales:1,municipalities:1,reporting_municipalities:active?1:0,received:active?1:0,counted:active?1:0,valid_votes:active?11:0},results:active?[{territory:'GT',party_id:'QA',party_name:'Opción de prueba',votes:11}]:[],territories:active?[{territory:'GT',actas:1,valid_votes:11,blank_votes:0,null_votes:0}]:[],municipalities:[{municipality_code:'0301',municipality_name:'Municipio de prueba',fiscales:1,received:active?1:0,counted:active?1:0,valid_votes:active?11:0}]};
 }`}));
 for(const width of [1440,390]) {
  await page.setViewportSize({width,height:1000});
  await page.goto('http://127.0.0.1:4190/rtd-preview.html');
  await page.getByText('Opción de prueba',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Entorno',{exact:true}).inputValue(),'TEST');
  assert.equal(await page.getByLabel('Año electoral').inputValue(),'2023');
  await page.getByRole('button',{name:'Listado nacional',exact:true}).click();
  await page.waitForFunction(()=>window.__lastRtd.input.election_type==='DIP_NAC');
  await page.getByRole('button',{name:'Con datos recibidos',exact:true}).click();
  await page.getByRole('button',{name:'Ver resultados →'}).click();
  await page.waitForFunction(()=>window.__lastRtd.input.municipality_code==='0301');
  await page.getByText('Opción de prueba',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
  await page.screenshot({path:`visual-rtd/ensayos-${width}.png`,fullPage:true});
  await page.getByLabel('Entorno',{exact:true}).selectOption('REAL');
  await page.getByText('Todavía no hay actas listas para sumar').waitFor();
  assert.equal(await page.getByLabel('Año electoral').inputValue(),'2027');
  assert.equal(await page.evaluate(()=>window.__lastRtd.input.municipality_code),'');
  await page.getByLabel('Entorno',{exact:true}).selectOption('DEMO');
  await page.getByText('DEMO · Pruebas aisladas',{exact:true}).waitFor();
  assert.equal(await page.getByLabel('Año electoral').inputValue(),'2023');
  await page.getByRole('button',{name:'Actualizar ahora'}).click();
  await page.waitForFunction(()=>window.__lastRtd.input.data_mode==='DEMO');
  await page.getByLabel('Entorno',{exact:true}).selectOption('TEST');
  await page.getByLabel('Año electoral').fill('2027');
  await page.getByText('Todavía no hay actas listas para sumar').waitFor();
  assert.equal(await page.evaluate(()=>window.__lastRtd.input.data_mode),'TEST');
 }
 assert.deepEqual(errors,[]);
 console.log('RTD_DESKTOP_MOBILE_MODES_YEARS_FILTERS_VERIFIED');
} finally {await browser?.close();server.kill()}
