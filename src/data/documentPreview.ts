import { unzipSync, strFromU8 } from "fflate";
export type PreviewSection = { title: string; paragraphs?: string[]; rows?: string[][] };
export type OfficePreview = { sections: PreviewSection[]; limited: boolean };
const elements = (root: Document | Element, name: string) => Array.from(root.getElementsByTagNameNS("*", name));
function xml(text: string) {
 if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("El documento contiene una estructura XML no admitida.");
 const doc = new DOMParser().parseFromString(text, "application/xml");
 if (doc.getElementsByTagName("parsererror").length) throw new Error("El documento no tiene un formato válido.");
 return doc;
}
export function parseCsv(text: string): string[][] {
 let inQuotes = false; let commas = 0; let semicolons = 0;
 for (const c of text) { if (c === '"') inQuotes = !inQuotes; else if (!inQuotes) { if (c === "\n") break; if (c === ",") commas++; if (c === ";") semicolons++; } }
 const delimiter = semicolons > commas ? ";" : ",";
 const rows: string[][] = []; let row: string[] = []; let cell = ""; let quoted = false;
 for (let i = 0; i < text.length && rows.length < 501; i++) {
  const c = text[i];
  if (c === '"') { if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
  else if (c === delimiter && !quoted) { row.push(cell.slice(0, 10000)); cell = ""; }
  else if (c === "\n" && !quoted) { row.push(cell.replace(/\r$/, "").slice(0, 10000)); rows.push(row.slice(0, 100)); row = []; cell = ""; }
  else cell += c;
 }
 if (cell || row.length) { row.push(cell.slice(0, 10000)); rows.push(row.slice(0, 100)); }
 return rows;
}
export function readOfficePreview(bytes: Uint8Array, extension: string): OfficePreview {
 let total = 0; let entries = 0;
 const archive = unzipSync(bytes, { filter: file => {
  if (!/^(word\/document\.xml|ppt\/(slides\/slide\d+\.xml|presentation\.xml|_rels\/presentation\.xml\.rels)|xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/sheet\d+\.xml))$/.test(file.name)) return false;
  total += file.originalSize; entries++;
  if (total > 32 * 1024 * 1024 || file.originalSize > 12 * 1024 * 1024 || entries > 250) throw new Error("Este documento es demasiado extenso para la vista previa. Descarga el original para abrirlo.");
  return true;
 }});
 const read = (path: string) => archive[path] ? xml(strFromU8(archive[path])) : null;
 if (extension === "docx") {
  const doc = read("word/document.xml"); if (!doc) throw new Error("No se encontró el contenido de Word.");
  const paragraphs = elements(doc, "p").map(p => elements(p, "t").map(t => t.textContent || "").join("")).filter(Boolean);
  return { sections: [{ title: "Documento", paragraphs: paragraphs.slice(0, 1500) }], limited: paragraphs.length > 1500 };
 }
 if (extension === "pptx") {
  let paths = Object.keys(archive).filter(path => /^ppt\/slides\/slide\d+\.xml$/.test(path)).sort((a, b) => a.localeCompare(b, "es", { numeric: true }));
  const presentation = read("ppt/presentation.xml"); const relations = read("ppt/_rels/presentation.xml.rels");
  if (presentation && relations) {
   const targets = new Map(elements(relations, "Relationship").map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target") || ""]));
   paths = elements(presentation, "sldId").map(slide => {
    const target = targets.get(slide.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id")) || "";
    return target.startsWith("/") ? target.slice(1) : `ppt/${target.replace(/^\.\//, "")}`;
   }).filter(path => Boolean(archive[path]));
  }
  if (!paths.length) throw new Error("No se encontraron diapositivas.");
  return { sections: paths.slice(0, 150).map((path, i) => ({ title: `Diapositiva ${i + 1}`, paragraphs: elements(read(path)!, "p").map(p => elements(p, "t").map(t => t.textContent || "").join("")).filter(Boolean) })), limited: paths.length > 150 };
 }
 const workbook = read("xl/workbook.xml"); const relations = read("xl/_rels/workbook.xml.rels");
 if (!workbook || !relations) throw new Error("No se encontró el libro de Excel.");
 const shared = read("xl/sharedStrings.xml");
 const strings = shared ? elements(shared, "si").map(si => elements(si, "t").map(t => t.textContent || "").join("")) : [];
 const targets = new Map(elements(relations, "Relationship").map(rel => [rel.getAttribute("Id"), rel.getAttribute("Target") || ""]));
 let limited = false;
 const sections = elements(workbook, "sheet").slice(0, 30).map(sheet => {
  const id = sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  const target = targets.get(id) || ""; const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  const doc = read(path); const allRows = doc ? elements(doc, "row") : [];
  if (allRows.length > 500) limited = true;
  const rows = allRows.slice(0, 500).map(row => {
   const result: string[] = [];
   for (const cell of elements(row, "c")) {
    const ref = cell.getAttribute("r") || ""; const letters = ref.match(/^[A-Z]+/i)?.[0] || "A";
    let col = 0; for (const char of letters.toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
    if (col > 100) { limited = true; continue; }
    const value = elements(cell, "v")[0]?.textContent || ""; const type = cell.getAttribute("t");
    result[col - 1] = (type === "s" ? strings[Number(value)] || "" : type === "inlineStr" ? elements(cell, "t").map(t => t.textContent || "").join("") : type === "b" ? value === "1" ? "Sí" : "No" : value).slice(0, 10000);
   }
   return Array.from({length: result.length}, (_, i) => result[i] || "");
  });
  return { title: sheet.getAttribute("name") || "Hoja", rows };
 });
 if (elements(workbook, "sheet").length > 30) limited = true;
 return { sections, limited };
}
