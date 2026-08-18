import type { CoverageStatus } from "../types/territory";

const labels: Record<CoverageStatus, string> = {
  complete: "Completo",
  partial: "Parcial",
  pending: "Pendiente",
};

export function StatusBadge({ status }: { status: CoverageStatus }) {
  return <span className={`status status--${status}`}>{labels[status]}</span>;
}
