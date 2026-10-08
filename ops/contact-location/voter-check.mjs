import assert from 'node:assert/strict';
export async function checkVoterRecord(page){
 for(const width of [1440,390]){
  await page.setViewportSize({width,height:900});
  for(const full of [false,true]){
   await page.goto('http://127.0.0.1:4190/voter-preview.html?demo=1'+(full?'&full=1':''));
   await page.getByRole('dialog').waitFor();
   assert.equal(await page.getByText('CAMPAÑA 2027 · DEMOSTRACIÓN',{exact:true}).count(),1);
   assert.equal(await page.getByRole('heading',{name:'Documento de identificación'}).count(),full?1:0);
   assert.equal(await page.getByRole('heading',{name:'Ubicación registrada'}).count(),full?1:0);
   assert.equal(await page.locator('img[alt*="logo" i]').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   assert.ok(await page.locator('.voter-record-sheet').evaluate(el=>el.scrollWidth<=el.clientWidth+1),'Sheet horizontal overflow');
   await page.screenshot({path:`visual-location/voter-${width}-${full?'full':'base'}.png`,fullPage:true});
   await page.emulateMedia({media:'print'});
   assert.equal(await page.getByTestId('background').isVisible(),false,'Private editor must not be printed');
   assert.equal(await page.getByRole('button',{name:'Imprimir ficha'}).isVisible(),false);
   await page.emulateMedia({media:'screen'});
   await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
  }
  await page.goto('http://127.0.0.1:4190/voter-preview.html?editor=1');
  const encoded=await page.evaluate(()=>{
   const c=document.createElement('canvas');c.width=480;c.height=360;const ctx=c.getContext('2d');ctx.fillStyle='#344d49';ctx.fillRect(0,0,480,360);ctx.fillStyle='#eff3e8';ctx.beginPath();ctx.moveTo(100,105);ctx.lineTo(380,75);ctx.lineTo(360,250);ctx.lineTo(85,270);ctx.closePath();ctx.fill();ctx.fillStyle='#276170';ctx.fillRect(160,140,120,30);return c.toDataURL('image/png').split(',')[1];
  });
  await page.locator('input[type=file]').setInputFiles({name:'dpi-ficticio.png',mimeType:'image/png',buffer:Buffer.from(encoded,'base64')});
  await page.getByText('Bordes detectados.',{exact:false}).waitFor();
  await page.getByAltText('DPI enderezado y recortado').waitFor();
  await page.getByRole('button',{name:'Usar fotografía',exact:true}).click();
  assert.match(await page.getByTestId('saved').textContent(),/^data:image\/jpeg;base64,/);
  const saved=await page.getByTestId('saved').textContent();
  await page.getByRole('button',{name:'Ajustar documento',exact:true}).click();
  await page.getByAltText('DPI enderezado y recortado').waitFor();
  await page.getByRole('button',{name:'Girar 90°'}).click();
  await page.screenshot({path:`visual-location/dpi-review-${width}.png`,fullPage:true});
  await page.getByRole('button',{name:'Cancelar',exact:true}).click();
  assert.equal(await page.getByTestId('saved').textContent(),saved,'Cancel must preserve the saved image');
  await page.getByRole('button',{name:'Ajustar documento',exact:true}).click();
  await page.getByAltText('DPI enderezado y recortado').waitFor();
  const handle=page.getByRole('button',{name:'Esquina 1 del documento'});const before=await handle.getAttribute('cx');await handle.focus();await page.keyboard.press('ArrowRight');assert.notEqual(await handle.getAttribute('cx'),before);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);
 }
 // Homography preserves a marked central area and removes the outer background.
 const rectified=await page.evaluate(async()=>{
  const c=document.createElement('canvas');c.width=300;c.height=200;const x=c.getContext('2d');x.fillStyle='#ff0000';x.fillRect(0,0,300,200);x.fillStyle='#00ff00';x.fillRect(60,40,180,120);
  const url=window.__rectifyDocument(c,[{x:.2,y:.2},{x:.8,y:.2},{x:.8,y:.8},{x:.2,y:.8}]);const img=new Image();img.src=url;await img.decode();const out=document.createElement('canvas');out.width=img.width;out.height=img.height;const ctx=out.getContext('2d');ctx.drawImage(img,0,0);return{width:img.width,height:img.height,pixel:[...ctx.getImageData(15,15,1,1).data]};
 });
 assert.equal(rectified.width,180);assert.equal(rectified.height,120);assert.ok(rectified.pixel[1]>220&&rectified.pixel[0]<30);
 console.log('VOTER_SHEET_DPI_REVIEW_CANCEL_PERSPECTIVE_MOBILE_DESKTOP_PASSED');
}
