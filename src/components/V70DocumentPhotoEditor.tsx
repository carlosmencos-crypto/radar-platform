import {useEffect,useRef,useState,type PointerEvent} from "react";
import {createPortal} from "react-dom";
import {useDismissibleDialog} from "../admin/useDismissibleDialog";
import {findDocumentCorners,loadDocumentCanvas,rectifyDocument,validDocumentCorners,type DocumentCorners} from "../data/documentPhoto";
import "../styles/document-photo.css";
const full:DocumentCorners=[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
export default function V70DocumentPhotoEditor({label,value,onChange,onError,onOpenChange}:{label:string;value:string;onChange:(value:string)=>void;onError:(message:string)=>void;onOpenChange?:(open:boolean)=>void}) {
 const [source,setSource]=useState<HTMLCanvasElement|null>(null),[original,setOriginal]=useState(""),[corners,setCorners]=useState<DocumentCorners>(full),[preview,setPreview]=useState(""),[rotation,setRotation]=useState(0),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const input=useRef<HTMLInputElement>(null),svg=useRef<SVGSVGElement>(null),request=useRef(0);
 const opened=busy||Boolean(source);
 const close=()=>{request.current++;setSource(null);setOriginal("");setPreview("");setBusy(false);};
 useDismissibleDialog(opened,close);
 useEffect(()=>{onOpenChange?.(opened);return()=>onOpenChange?.(false);},[opened,onOpenChange]);
 useEffect(()=>()=>{request.current++;},[]);
 useEffect(()=>{
  if(!source)return;
  let active=true;setPreview("");
  const timer=window.setTimeout(()=>{try{const result=rectifyDocument(source,corners,rotation);if(active)setPreview(result);}catch{if(active)setPreview("");}},100);
  return()=>{active=false;window.clearTimeout(timer);};
 },[source,corners,rotation]);
 async function open(src:string) {
  const version=++request.current;setBusy(true);setNotice("");setRotation(0);setPreview("");
  try{const canvas=await loadDocumentCanvas(src);if(version!==request.current)return;const found=findDocumentCorners(canvas);setSource(canvas);setOriginal(canvas.toDataURL('image/jpeg',.96));setCorners(found||full);setNotice(found?"Bordes detectados. Revisá que las cuatro esquinas incluyan todo el DPI.":"No se detectó un contorno seguro. Mové las cuatro esquinas hasta los bordes del DPI.");}
  catch(e){if(version===request.current){onError(e instanceof Error?e.message:"No se pudo abrir la fotografía.");close();}}
  finally{if(version===request.current)setBusy(false);}
 }
 function move(index:number,x:number,y:number){setCorners(current=>current.map((p,i)=>i===index?{x:Math.max(0,Math.min(1,x)),y:Math.max(0,Math.min(1,y))}:p) as DocumentCorners);}
 function drag(event:PointerEvent<SVGCircleElement>,index:number){if(!event.currentTarget.hasPointerCapture(event.pointerId))return;const box=svg.current?.getBoundingClientRect();if(box)move(index,(event.clientX-box.left)/box.width,(event.clientY-box.top)/box.height);}
 return <div className="document-photo-field"><span>{label}</span><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" hidden onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(!/^image\/(jpeg|png|webp)$/.test(file.type)||file.size>25*1024*1024){onError("Usá una fotografía JPG, PNG o WebP de hasta 25 MB.");return;}const url=URL.createObjectURL(file);void open(url).finally(()=>URL.revokeObjectURL(url));}}/>
  {value&&<img className="document-photo-thumb" src={value} alt={`DPI ${label.toLowerCase()} guardado o preparado`}/>}
  <div className="document-photo-controls"><button type="button" disabled={busy} onClick={()=>input.current?.click()}>{value?"Cambiar fotografía":"Tomar o subir fotografía"}</button>{value&&<><button type="button" onClick={()=>void open(value)}>Ajustar documento</button><button type="button" className="document-photo-remove" onClick={()=>onChange("")}>Quitar</button></>}</div><small>Hasta 25 MB · Ajuste y optimización automática · Se guarda con la ficha.</small>
  {opened&&createPortal(<div className="document-photo-backdrop" onClick={e=>{if(e.target===e.currentTarget)close();}}><section className="document-photo-dialog" role="dialog" aria-modal="true" aria-labelledby="document-photo-title"><header><div><small>DOCUMENTO DE IDENTIFICACIÓN</small><h2 id="document-photo-title">Ajustar DPI · {label.toLowerCase()}</h2></div><button type="button" aria-label="Cerrar ajuste de DPI" onClick={close}>×</button></header>
   {busy?<p role="status" className="document-photo-notice">Detectando los bordes del documento…</p>:<><p className="document-photo-notice" role="status">{notice}</p><div className="document-photo-workspace"><div className="document-photo-original"><img src={original} alt="Fotografía original para delimitar el DPI"/><svg ref={svg} viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="Ajustar las cuatro esquinas del DPI"><polygon points={corners.map(p=>`${p.x*100},${p.y*100}`).join(' ')}/>{corners.map((p,i)=><circle key={i} cx={p.x*100} cy={p.y*100} r="2.3" tabIndex={0} role="button" aria-label={`Esquina ${i+1} del documento`} onPointerDown={e=>{e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);}} onPointerMove={e=>drag(e,i)} onKeyDown={e=>{const delta:Record<string,[number,number]>={ArrowLeft:[-.005,0],ArrowRight:[.005,0],ArrowUp:[0,-.005],ArrowDown:[0,.005]};if(delta[e.key]){e.preventDefault();move(i,p.x+delta[e.key][0],p.y+delta[e.key][1]);}}}/>)}</svg></div><div className="document-photo-result"><small>ASÍ QUEDARÁ</small>{preview?<img src={preview} alt="DPI enderezado y recortado"/>:<p>{validDocumentCorners(corners)?"Preparando vista previa…":"Ordená las esquinas sin cruzarlas."}</p>}</div></div><div className="document-photo-tools"><button type="button" onClick={()=>{if(!source)return;const found=findDocumentCorners(source);if(found){setCorners(found);setNotice("Bordes detectados. Revisá el recorte antes de usarlo.");}else setNotice("No se detectó un contorno seguro. Ajustá las cuatro esquinas manualmente.");}}>Detectar de nuevo</button><button type="button" onClick={()=>setRotation(r=>(r+90)%360)}>Girar 90°</button><button type="button" onClick={()=>{setCorners(full);setRotation(0);}}>Usar foto completa</button></div></>}
   <footer><button type="button" onClick={close}>Cancelar</button><button type="button" disabled={!preview||busy} onClick={()=>{onChange(preview);close();}}>Usar fotografía</button></footer>
  </section></div>,document.body)}
 </div>;
}
