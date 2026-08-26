export type CoverageStatus = "complete" | "partial" | "pending";

export interface Municipality {
  code: string;
  departmentCode: string;
  name: string;
  department: string;
  coverage: CoverageStatus;
  releaseStatus?: string;
  visibleModules?: number;
  emptyStateModules?: number;
  totalModules?: number;
  tseCoverageStatus?: string;
  population?: number;
  electors?: number;
  lastUpdated?: string;
}
