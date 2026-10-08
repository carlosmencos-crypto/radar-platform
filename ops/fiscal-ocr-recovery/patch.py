from pathlib import Path
import hashlib,sys
src=Path(sys.argv[1]);dst=Path(sys.argv[2]);s=src.read_text()
def replace(a,b):
 global s
 assert s.count(a)==1,('Patch shape changed',a[:100],s.count(a))
 s=s.replace(a,b)
replace('async function T(e,t,n){let r=await ee();return new Promise((i,a)=>{let o=r.transaction(e,t);n(o.objectStore(e),i,a),o.oncomplete=()=>r.close(),o.onerror=()=>a(o.error)})}', '''async function T(e,t,n){let r=await ee();return new Promise((resolve,reject)=>{let tx,value,settled=false;const fail=error=>{if(!settled){settled=true;r.close();reject(error||Error("No se pudo conservar el borrador."))}};try{tx=r.transaction(e,t);tx.oncomplete=()=>{if(!settled){settled=true;r.close();resolve(value)}};tx.onerror=()=>fail(tx.error);tx.onabort=()=>fail(tx.error||Error("El guardado fue interrumpido."));n(tx.objectStore(e),result=>{value=result},error=>{try{tx.abort()}catch{}fail(error)})}catch(error){fail(error)}})}''')
replace('k=`rtd-${radarAssignmentId}-${i}-${o?.catalogVersion??`pendiente`}`;(0,x.useEffect)(()=>{let e=s?', 'k=`rtd-${radarAssignmentId}-${i}-${o?.catalogVersion??`pendiente`}`;const radarLoaded=(0,x.useRef)(""),radarReading=(0,x.useRef)(false),radarCurrentKey=(0,x.useRef)(k);radarCurrentKey.current=k;(0,x.useEffect)(()=>{let cancelled=false;radarLoaded.current="";te(null);ne({});ae(et());ee({value:0,status:""});let e=s?')
replace('re(k).then(t=>{let n=t??e??c();u(n),n.actFile&&b(URL.createObjectURL(n.actFile))})},[k,i,s,c]),(0,x.useEffect)(()=>{if(!oe){let e=window.setTimeout(()=>void D(k,l),250);return()=>window.clearTimeout(e)}},[l,k,oe])', '''re(k).then(t=>{if(cancelled)return;let n=(oe?e:t??e)??c();radarLoaded.current=k;u(n);b(n.actFile?URL.createObjectURL(n.actFile):"")}).catch(()=>{if(cancelled)return;radarLoaded.current=k;u(e??c());m("No se pudo recuperar el borrador local. Mantén esta página abierta mientras trabajas.")});return()=>{cancelled=true;radarLoaded.current=""}},[k,oe]),(0,x.useEffect)(()=>{if(!oe&&radarLoaded.current===k){let e=window.setTimeout(()=>{void D(k,l).catch(()=>m("No se pudo guardar en este dispositivo. Mantén el acta abierta e intenta guardar nuevamente."))},250);return()=>window.clearTimeout(e)}},[l,k,oe])''')
replace('async function me(){if(!(!l.actFile||!o)){C(!0)', 'async function me(){if(!l.actFile||!o||radarReading.current||radarLoaded.current!==k)return;radarReading.current=true;const radarOcrKey=k;{C(!0)')
replace('status:`Preparando fotografía`});try{let e=await Qe(', 'status:`Guardando fotografía antes de leer…`});try{await D(k,l);let e=await Qe(')
replace('o.catalogVersion);te(e),ne(', 'o.catalogVersion);if(radarCurrentKey.current!==radarOcrKey)return;te(e),ne(')
replace('No fue posible completar la lectura. Revisa tu conexión e inténtalo nuevamente; también puedes digitar los datos.', 'No se pudo completar la lectura. La fotografía sigue cargada: vuelve a intentarlo o ingresa las cifras manualmente.')
replace('})}finally{C(!1)}}}function he()', '})}finally{radarReading.current=false;C(!1)}}}function he()')
# Every one of the five passes previously retained duplicate data URLs and large temporary images.
replace('preview:r.toDataURL(`image/png`)','preview:e===172?r.toDataURL(`image/png`):``')
replace('te=g.map(e=>{let t=document.createElement(`canvas`)', 'te=e=>{let t=document.createElement(`canvas`)')
replace('n.drawImage(e.canvas,0,t*138))),t}),E=g.map(e=>Ue(e)),ne=', 'n.drawImage(e.canvas,0,t*138))),t},E=e=>Ue(e),ne=')
replace('for(let[e,r]of te.entries()){ne=', 'for(let[e,radarSet]of g.entries()){let r=te(radarSet);ne=')
replace('let i=await ie.recognize(r,{},{text:!0,blocks:!0});for(let r of Be', 'let i;try{i=await ie.recognize(r,{},{text:!0,blocks:!0})}finally{r.width=0;r.height=0}for(let r of Be')
replace('for(let[e,r]of E.entries()){ne=', 'for(let[e,radarSet]of g.entries()){let r=E(radarSet);ne=')
replace('let i=await ie.recognize(r.atlas,{},{text:!0,blocks:!0}),a=new Map;', 'let i;try{i=await ie.recognize(r.atlas,{},{text:!0,blocks:!0})}finally{r.atlas.width=0;r.atlas.height=0}let a=new Map;')
# No changes to OCR numeric interpretation, fiscal authentication, backend or RTD transmission.
dst.write_text(s)
print('FISCAL_OCR_RECOVERY_PATCH_OK',hashlib.sha256(s.encode()).hexdigest())
