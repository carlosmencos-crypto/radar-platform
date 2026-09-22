export type ManagementDimension = {
  code: string;
  name: string;
  score: number;
  category: string;
  national_rank: number;
  department_rank: number;
  department_average: number;
  national_average: number;
};
export type ManagementBenchmark = {
  municipality_code: string;
  cycle: string;
  source_url: string;
  zero_reported_by_source: boolean;
  dimensions: ManagementDimension[];
};

export function municipalManagementBenchmark(value: unknown, municipalityCode: string): ManagementBenchmark | null {
  if (!value || typeof value !== "object") return null;
  const data = value as ManagementBenchmark;
  if (data.municipality_code !== municipalityCode || data.cycle !== "2020-2021" || !Array.isArray(data.dimensions)) return null;
  const codes = ["IPC", "IIC", "ISP", "IGA", "IGF", "IGE"];
  if (data.dimensions.length !== codes.length || new Set(data.dimensions.map((d) => d?.code)).size !== codes.length) return null;
  if (!data.dimensions.every((d) => d && codes.includes(d.code)
    && typeof d.name === "string" && typeof d.category === "string"
    && [d.score, d.department_average, d.national_average].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    && [d.national_rank, d.department_rank].every((n) => Number.isInteger(n) && n >= 1 && n <= 340))) return null;
  return data;
}
