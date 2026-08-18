import type { Municipality } from "../types/territory";

export const municipalities: Municipality[] = [
  {
    code: "0509",
    departmentCode: "05",
    name: "San José",
    department: "Escuintla",
    coverage: "complete",
    population: 72156,
    electors: 40890,
    lastUpdated: "2026-08-17",
  },
  {
    code: "0501",
    departmentCode: "05",
    name: "Escuintla",
    department: "Escuintla",
    coverage: "partial",
  },
  {
    code: "0502",
    departmentCode: "05",
    name: "Santa Lucía Cotzumalguapa",
    department: "Escuintla",
    coverage: "partial",
  },
  {
    code: "0513",
    departmentCode: "05",
    name: "Nueva Concepción",
    department: "Escuintla",
    coverage: "partial",
  },
];

export const findMunicipality = (code?: string) =>
  municipalities.find((municipality) => municipality.code === code);
