import { useEffect, useRef, useState } from "react";
import { fetchSharedResourceBlob, downloadSharedResource, type SharedContent } from "../data/radarSharedContent";
import { resourceExtension, resourceMimeTypes } from "../data/resourceFormats";
import { parseCsv, readOfficePreview, type OfficePreview } from "../data/documentPreview";

export default function ResourcePreview({ resource, onClose }: { resource: SharedContent; onClose: () => void }) {
 const [url, setUrl] = useState(""); const [preview, setPreview] = useState<OfficePreview | null>(null);
 const [error, setError] = useState(""); const [loading, setLoading] = useState(true); const [section, setSection] = useState(0);
 const closeButton = useRef<HTMLButtonElement>(null);
 const extension = resourceExtension(resource.file_name);
 useEffect(() => {
  const previous = document.activeElement as HTMLElement | null;
  closeButton.current?.focus();
  return () => previous?.focus();
 }, []);
 useEffect(() => {
  const close = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopImmediatePropagation(); onClose(); } };
  document.addEventListener("keydown", close, true); return () => document.removeEventListener("keydown", close, true);
 }, [onClose]);
 useEffect(() => {
  let active = true; let objectUrl = "";
  void fetchSharedResourceBlob(resource).then(async blob => {
   if (!active) return;
   if (["docx", "xlsx", "pptx"].includes(extension)) {
    const data = readOfficePreview(new Uint8Array(await blob.arrayBuffer()), extension); if (active) setPreview(data);
   } else if (["csv", "txt"].includes(extension)) {
    const text = await blob.text(); if (active) setPreview({ sections: [{ title: resource.file_name, ...(extension === "csv" ? { rows: parseCsv(text).slice(0,500) } : { paragraphs: text.slice(0,200000).split(/\r?\n/) }) }], limited: extension === "csv" ? parseCsv(text).length > 500 : text.length > 200000 });
   } else if (["pdf", "png", "jpg", "jpeg", "webp", "mp4"].includes(extension)) {
    objectUrl = URL.createObjectURL(new Blob([blob], {type: resourceMimeTypes[extension]})); if (active) setUrl(objectUrl);
   } else setError("Este formato antiguo se puede descargar. Para previsualizarlo, publica una versión PDF, DOCX, XLSX o PPTX.");
  }).catch(e => { if (active) setError(e instanceof Error ? e.message : "No se pudo abrir el documento."); }).finally(() => { if (active) setLoading(false); });
  return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
 }, [resource.id, resource.storage_path, extension, resource.file_name]);
 const current = preview?.sections[section];
 return <div className="resource-preview-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}><section className="resource-preview" role="dialog" aria-modal="true" aria-label={`Vista previa: ${resource.title}`}><header><div><small>BIBLIOTECA RADAR · {extension.toUpperCase()}</small><h2>{resource.title}</h2><p>{resource.file_name} · Versión {resource.version}</p></div><nav><button type="button" onClick={() => void downloadSharedResource(resource).catch(e=>setError(e.message))}>Descargar original</button><button type="button" ref={closeButton} aria-label="Cerrar vista previa" onClick={onClose}>×</button></nav></header>
 <div className="resource-preview-body">{loading ? <p role="status">Preparando vista previa…</p> : error ? <p role="status">{error}</p> : preview ? <><div className="resource-preview-toolbar"><label>Contenido<select value={section} onChange={event=>setSection(Number(event.target.value))}>{preview.sections.map((item,i)=><option key={i} value={i}>{item.title}</option>)}</select></label><p>Vista de contenido. El original conserva diseño, imágenes, gráficos y formatos de celda.{preview.limited ? " Vista reducida por el tamaño del documento." : ""}</p></div><article className="resource-document-page">{current?.paragraphs?.map((text,i)=><p key={i}>{text || "\u00a0"}</p>)}{current?.rows ? <div className="resource-sheet-scroll"><table><tbody>{current.rows.map((row,i)=><tr key={i}><th>{i+1}</th>{row.map((cell,j)=><td key={j}>{cell}</td>)}</tr>)}</tbody></table></div> : null}{!current?.paragraphs?.length && !current?.rows?.length ? <p>Esta sección no contiene texto o celdas disponibles para la vista previa.</p> : null}</article></> : extension === "pdf" ? <iframe title={`PDF: ${resource.title}`} src={url} /> : extension === "mp4" ? <video controls src={url} /> : <img src={url} alt={resource.title} />}</div></section></div>;
}
