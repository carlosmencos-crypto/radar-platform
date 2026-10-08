from pathlib import Path
import hashlib,sys
s=Path(sys.argv[1]).read_text()
def replace(a,b):
 global s
 assert s.count(a)==1,('Unexpected source shape',a[:120],s.count(a))
 s=s.replace(a,b)
# Persist the selected election per assignment, never globally across real/demo sessions.
helpers='''function radarWorkKey(id){return "radar-fiscal-work-v2-"+encodeURIComponent(String(id))}
function radarReadWork(id){try{return JSON.parse(localStorage.getItem(radarWorkKey(id))||"null")}catch{return null}}
function radarRememberWork(id,type,phase){try{localStorage.setItem(radarWorkKey(id),JSON.stringify({type,phase}))}catch{}}
function radarInitialElection(id,elections){const saved=radarReadWork(id);return elections.some(e=>e.type===saved?.type)?saved.type:elections[0]?.type??"CORPORACION_MUNICIPAL"}
'''
replace('function _t({assignmentId:radarAssignmentId',helpers+'function _t({assignmentId:radarAssignmentId')
replace('(0,x.useState)(e[0]?.type??`CORPORACION_MUNICIPAL`)', '(0,x.useState)(()=>radarInitialElection(radarAssignmentId,e))')
replace('b(n.actFile?URL.createObjectURL(n.actFile):"")', '''b(n.actFile?URL.createObjectURL(n.actFile):"");if(n.actFile&&radarReadWork(radarAssignmentId)?.phase==="reading"){v("Recuperamos tu acta. La lectura anterior se interrumpió; puedes volver a leerla sin subir la fotografía.");radarRememberWork(radarAssignmentId,i,"ready")}''')
replace('value:i,disabled:S||h,onChange:e=>{a(e.target.value),fe(),v(``)}', 'value:i,disabled:S||h,onChange:e=>{radarRememberWork(radarAssignmentId,e.target.value,"ready");a(e.target.value),fe(),v(``)}')
# Key the whole form to the verified assignment; switching assignments cannot reuse its state.
replace('assignmentId:e.assignment.id,elections:e.elections,folios:i,onSaveDraft:ee,onSubmit:T}', 'assignmentId:e.assignment.id,elections:e.elections,folios:i,onSaveDraft:ee,onSubmit:T},e.assignment.id')
# Save original before preparation and adjusted image before declaring it ready. Avoid old autosave overwriting photo.
start=s.index('async function pe(e){if(e){g(!0),v(`Preparando una copia legible del acta…`)')
end=s.index('async function me()',start)
s=s[:start]+'''async function pe(file){if(!file||radarReading.current||radarLoaded.current!==k)return;
 const photoKey=k;g(true);radarReading.current=true;v("Guardando fotografía…");fe();
 try{await D(photoKey,{...l,actFile:file});radarRememberWork(radarAssignmentId,i,"ready");
 let prepared;try{prepared=await Se(file,message=>v(message))}catch{prepared={file,message:"Fotografía lista. RADAR conservará esta imagen sin ajuste automático."}}
 if(radarCurrentKey.current!==photoKey)return;
 await D(photoKey,{...l,actFile:prepared.file});u(current=>({...current,actFile:prepared.file}));b(URL.createObjectURL(prepared.file));v(prepared.message);
 }catch(error){m("No se pudo conservar la fotografía en este dispositivo. Libera espacio e intenta adjuntarla nuevamente antes de leer.")}
 finally{radarReading.current=false;g(false)}}''' +s[end:]
replace('if(!oe&&radarLoaded.current===k){let e=window.setTimeout(()=>{void D(k,l)', 'if(!oe&&!h&&!S&&radarLoaded.current===k){let e=window.setTimeout(()=>{void D(k,l)')
replace('},[l,k,oe]),(0,x.useEffect)', '},[l,k,oe,h,S]),(0,x.useEffect)')
replace('try{await D(k,l);let e=await Qe(', 'try{await D(k,l);radarRememberWork(radarAssignmentId,i,"reading");let e=await Qe(')
replace('finally{radarReading.current=false;C(!1)}', 'finally{radarRememberWork(radarAssignmentId,i,"ready");radarReading.current=false;C(!1)}')
Path(sys.argv[2]).write_text(s)
print('FISCAL_COLD_START_PATCH_OK',hashlib.sha256(s.encode()).hexdigest())
