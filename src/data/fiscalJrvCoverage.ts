import type { CampaignModuleRecord } from "./radarRuntime";
import type { V70ElectoralCenter } from "./v70ElectoralAdapter";

export function fiscalJrvCoverage(
  centers: Pick<V70ElectoralCenter, "id" | "jrv" | "jrvRange">[],
  records: CampaignModuleRecord[],
  campaignId: string | null,
) {
  const valid = new Set<string>();
  let total = 0;
  for (const center of centers) {
    if (!Number.isSafeInteger(center.jrv) || center.jrv <= 0) continue;
    total += center.jrv;
    const numbers = new Set<number>();
    for (const segment of center.jrvRange.split(/[;,]+/)) {
      const match = segment.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
      if (!match) continue;
      const start = Number(match[1]);
      const end = Number(match[2] ?? match[1]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end - start >= center.jrv) continue;
      for (let jrv = start; jrv <= end; jrv++) numbers.add(jrv);
    }
    // Only source-backed, reconciled ranges can establish an assigned table.
    if (numbers.size === center.jrv) {
      for (const jrv of numbers) valid.add(`${center.id}:${jrv}`);
    }
  }
  const assigned = new Set<string>();
  for (const record of records) {
    if (!campaignId || record.campaign_id !== campaignId || record.category !== "ASIGNACION_JRV" || !String(record.payload.fiscal_id ?? "").trim()) continue;
    const jrv = Number(record.payload.jrv);
    if (!Number.isSafeInteger(jrv) || jrv < 1) continue;
    const key = `${String(record.payload.center_id)}:${jrv}`;
    if (valid.has(key)) assigned.add(key);
  }
  const covered = assigned.size;
  return { covered, total, percent: total > 0 ? covered / total * 100 : null };
}
