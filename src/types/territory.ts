export type CoverageStatus = "complete" | "partial" | "pending";

export interface Municipality {
  code: string;
  departmentCode: string;
  name: string;
  department: string;
  coverage: CoverageStatus;
  population?: number;
  electors?: number;
  lastUpdated?: string;
}
