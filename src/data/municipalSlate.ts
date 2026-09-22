import type { MunicipalElectoralBasis } from "./radarRuntime";

export type MunicipalSlateSlot = readonly [string, string, string, "ALCALDE" | "SÍNDICOS" | "CONCEJALES"];
const roman = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

export function municipalSlateSlots(basis: MunicipalElectoralBasis | null | undefined, code: string): MunicipalSlateSlot[] {
  if (!basis || basis.municipality_code !== code || basis.source_status !== "VALIDATED") return [];
  const counts = [basis.mayor, basis.syndics_titular, basis.syndics_substitute, basis.councilors_titular, basis.councilors_substitute];
  if (counts.some((n) => !Number.isInteger(n) || n < 0 || n > 10) || basis.mayor !== 1 ||
      counts.reduce((sum, n) => sum + n, 0) !== basis.all_positions ||
      basis.mayor + basis.syndics_titular + basis.councilors_titular !== basis.titular_positions) return [];
  // Retain the previous slot identifiers so saved legal/agenda links keep their identity.
  const slots: MunicipalSlateSlot[] = [["CA01", "Alcalde", "Candidato a alcalde", "ALCALDE"]];
  for (let i = 0; i < basis.syndics_titular; i++) slots.push([`CA${String(i + 2).padStart(2, "0")}`, `Síndico ${roman[i]}`, `Síndico ${roman[i]}`, "SÍNDICOS"]);
  for (let i = 0; i < basis.councilors_titular; i++) slots.push([i < 8 ? `CA${String(i + 5).padStart(2, "0")}` : `CA-C${i + 1}`, `Concejal ${roman[i]}`, `Concejal ${roman[i]}`, "CONCEJALES"]);
  for (let i = 0; i < basis.syndics_substitute; i++) slots.push([`CA-SS${i + 1}`, `Síndico suplente ${roman[i]}`, `Síndico suplente ${roman[i]}`, "SÍNDICOS"]);
  for (let i = 0; i < basis.councilors_substitute; i++) slots.push([`CA-CS${i + 1}`, `Concejal suplente ${roman[i]}`, `Concejal suplente ${roman[i]}`, "CONCEJALES"]);
  return slots;
}
