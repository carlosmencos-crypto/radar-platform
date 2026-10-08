// Browser regression harness with simulated GPS and map transport; no user data or external writes.
import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import {spawn,execSync} from 'node:child_process';
import fs from 'node:fs';
import assert from 'node:assert/strict';
const root=process.argv[2];
fs.copyFileSync('recovery-source/ops/contact-location/preview.tsx',root+'/location-preview.tsx');
fs.writeFileSync(root+'/location-preview.html','<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/location-preview.tsx"></script></body></html>');
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4190'],{cwd:root,stdio:'ignore'});
fs.mkdirSync('visual-location',{recursive:true});
let browser;
try{
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:4190/location-preview.html');break}catch{} await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:execSync('which google-chrome').toString().trim(),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>route.request().url().startsWith('http://127.0.0.1:4190/')?route.continue():route.abort());
 await page.addInitScript(()=>{
  window.__gpsCalls=0;
  Object.defineProperty(navigator,'geolocation',{value:{getCurrentPosition(success,failure){window.__gpsCalls++;window.__gpsSuccess=success;window.__gpsFailure=failure;}}});
  const layer=()=>({remove(){},addTo(){return this}});
  window.L={map(node){node.style.background='linear-gradient(30deg,#e6ece7,#f5f3eb)';node.setAttribute('data-testid','map');return{setView(){return this},flyTo(){return this},remove(){},on(event,cb){node.addEventListener(event,()=>cb({latlng:{lat:14.7,lng:-90.7}}));return this}}},tileLayer:layer,circleMarker:layer,polyline:layer,layerGroup:layer};
 });
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:4190/location-preview.html');
  await page.getByTestId('map').waitFor();
  assert.equal(await page.evaluate(()=>window.__gpsCalls),1);
  assert.equal(await page.getByRole('button',{name:'Confirmar ubicación'}).isEnabled(),false);
  await page.evaluate(()=>window.__gpsFailure({code:1}));
  await page.getByText('No se autorizó la ubicación.',{exact:false}).waitFor();
  await page.getByTestId('map').click();
  await page.getByRole('button',{name:'Confirmar ubicación'}).click();
  assert.equal(JSON.parse(await page.getByTestId('result').textContent()).latitude,14.7);
  // A late GPS callback cannot move a manually selected point.
  await page.evaluate(()=>window.__gpsSuccess({coords:{latitude:10,longitude:10,accuracy:5}}));
  await page.getByRole('button',{name:'Confirmar ubicación'}).click();
  assert.equal(JSON.parse(await page.getByTestId('result').textContent()).latitude,14.7);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'Horizontal overflow');
  const box=await page.getByRole('button',{name:'Confirmar ubicación'}).boundingBox();
  assert.ok(box && box.y>=0 && box.y+box.height<=900,'Confirmation outside viewport');
  await page.screenshot({path:`visual-location/contact-map-${width}.png`,fullPage:true});
  await page.goto('http://127.0.0.1:4190/location-preview.html?saved=1');
  await page.getByTestId('map').waitFor();
  assert.equal(await page.evaluate(()=>window.__gpsCalls),0,'Saved location requested GPS');
  await page.getByRole('button',{name:'Confirmar ubicación'}).click();
  assert.equal(JSON.parse(await page.getByTestId('result').textContent()).latitude,14.6);
  await page.getByRole('button',{name:'Usar mi ubicación actual'}).click();
  await page.evaluate(()=>window.__gpsSuccess({coords:{latitude:14.8,longitude:-90.8,accuracy:8}}));
  await page.getByRole('button',{name:'Confirmar ubicación'}).click();
  assert.equal(JSON.parse(await page.getByTestId('result').textContent()).latitude,14.8);
 }
 assert.deepEqual(errors,[]);
 console.log('CONTACT_LOCATION_GPS_MANUAL_SAVED_POINT_MOBILE_DESKTOP_PASSED');
}finally{await browser?.close();server.kill()}
