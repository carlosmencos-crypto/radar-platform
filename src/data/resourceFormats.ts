export const resourceMimeTypes: Record<string, string> = {
 pdf: "application/pdf", doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
 xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
 ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
 csv: "text/csv", txt: "text/plain", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", mp4: "video/mp4",
};
export const resourceAccept = Object.entries(resourceMimeTypes).flatMap(([extension, mime]) => [`.${extension}`, mime]).join(",");
export function resourceExtension(name: string) { return name.split(".").pop()?.toLowerCase() || ""; }
export function validateResource(file: Pick<File, "name" | "size">) {
 if (!file.size || file.size > 25 * 1024 * 1024) throw new Error("Selecciona un archivo de hasta 25 MB.");
 if (!resourceMimeTypes[resourceExtension(file.name)]) throw new Error("Usa Word, Excel, PowerPoint, PDF, CSV, TXT, imagen o MP4.");
}
