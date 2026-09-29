import type { RtdEvidence } from "./radarRuntime";
export function archivePart(value: string) {
  return value.normalize("NFC").replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").replace(/^\.+|\.+$/g, "").trim().slice(0, 120) || "Sin nombre";
}
export function actaPath(file: RtdEvidence) {
  return [archivePart(`${file.municipality_code} ${file.municipality_name}`), archivePart(file.center_name), `JRV ${file.jrv_number}`, archivePart(file.election_type), `${file.id}-${archivePart(file.file_name)}`].join("/");
}
