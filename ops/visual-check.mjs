import {chromium} from '/tmp/radar-visual/node_modules/playwright/index.mjs';
import {spawn,execSync} from 'node:child_process';
import fs from 'node:fs';
const root=process.argv[2];
// Export only inside this temporary development harness, after the release build.
fs.appendFileSync(root+'/src/components/V70DirectResources0509.tsx','\nexport {Materials};\n');
fs.copyFileSync('recovery-source/ops/preview.tsx',root+'/oct08-preview.tsx');
fs.writeFileSync(root+'/oct08-preview.html','<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/assets/team-access-v2.css"></head><body><div id="root"></div><script type="module" src="/oct08-preview.tsx"></script></body></html>');
const server=spawn('npm',['run','dev','--','--host','127.0.0.1','--port','4190'],{cwd:root,stdio:'ignore'});
fs.mkdirSync('visual-library',{recursive:true});
let browser;
try {
 for(let i=0;i<50;i++){try{await fetch('http://127.0.0.1:4190/oct08-preview.html');break}catch{} await new Promise(r=>setTimeout(r,200))}
 browser=await chromium.launch({executablePath:execSync('which google-chrome').toString().trim(),args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:1000}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/src/data/radarSharedContent.ts',route=>route.fulfill({contentType:'application/javascript',body:`
 export async function loadSharedContent(){return [{id:'fixture',kind:'resource',category:'Manuales',title:'Manual',body:'Documento de prueba',version:'1',file_name:'manual.txt',storage_path:'fixture'}]}
 export async function acknowledgeNotice(){return true}
 export async function downloadSharedResource(record){window.__downloaded=record.id}
 export async function fetchSharedResourceBlob(){return new Blob(['Contenido de prueba'],{type:'text/plain'})}
 `}));
 for(const demo of [false,true]) {
  for(const width of [1440,390]) {
   await page.setViewportSize({width,height:900});
   await page.goto('http://127.0.0.1:4190/oct08-preview.html?'+(demo?'demo=1':''));
   await page.getByRole('button',{name:'Abrir · 1',exact:true}).click();
   const modal=page.getByRole('dialog',{name:'Manuales'});await modal.waitFor();
   const desc=await modal.locator('.resource-library-details p').evaluate(el=>({weight:getComputedStyle(el).fontWeight,spacing:getComputedStyle(el).letterSpacing}));
   if(desc.weight!=='400'||!['0px','normal'].includes(desc.spacing))throw Error('Description inherited heavy typography');
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw Error('Horizontal overflow');
   await modal.screenshot({path:`visual-library/library-${demo?'demo':'real'}-${width}.png`});
   await modal.getByRole('button',{name:'Descargar',exact:true}).click();
   if(await page.evaluate(()=>window.__downloaded)!=='fixture')throw Error('Download disconnected');
   await modal.getByRole('button',{name:'Previsualizar',exact:true}).click();
   await page.getByText('Contenido de prueba',{exact:true}).waitFor();
   if(!await modal.evaluate(el=>el.inert))throw Error('Folder not inert under preview');
   await page.keyboard.press('Escape');
   await modal.getByRole('button',{name:'Descargar',exact:true}).waitFor();
   await page.keyboard.press('Escape');
   await modal.waitFor({state:'detached'});
  }
 }
 if(errors.length)throw Error(errors.join('\n'));
 console.log('LIBRARY_DESKTOP_MOBILE_PREVIEW_DOWNLOAD_OK');
}finally{await browser?.close();server.kill()}
