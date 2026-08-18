export interface Department {
  code: string;
  name: string;
  municipalityCount: number;
}

export const departments: Department[] = [
  { code: "01", name: "Guatemala", municipalityCount: 17 },
  { code: "02", name: "El Progreso", municipalityCount: 8 },
  { code: "03", name: "Sacatepéquez", municipalityCount: 16 },
  { code: "04", name: "Chimaltenango", municipalityCount: 16 },
  { code: "05", name: "Escuintla", municipalityCount: 14 },
  { code: "06", name: "Santa Rosa", municipalityCount: 14 },
  { code: "07", name: "Sololá", municipalityCount: 19 },
  { code: "08", name: "Totonicapán", municipalityCount: 8 },
  { code: "09", name: "Quetzaltenango", municipalityCount: 24 },
  { code: "10", name: "Suchitepéquez", municipalityCount: 21 },
  { code: "11", name: "Retalhuleu", municipalityCount: 9 },
  { code: "12", name: "San Marcos", municipalityCount: 30 },
  { code: "13", name: "Huehuetenango", municipalityCount: 33 },
  { code: "14", name: "Quiché", municipalityCount: 21 },
  { code: "15", name: "Baja Verapaz", municipalityCount: 8 },
  { code: "16", name: "Alta Verapaz", municipalityCount: 17 },
  { code: "17", name: "Petén", municipalityCount: 14 },
  { code: "18", name: "Izabal", municipalityCount: 5 },
  { code: "19", name: "Zacapa", municipalityCount: 11 },
  { code: "20", name: "Chiquimula", municipalityCount: 11 },
  { code: "21", name: "Jalapa", municipalityCount: 7 },
  { code: "22", name: "Jutiapa", municipalityCount: 17 },
];

export const findDepartment = (code?: string) =>
  departments.find((department) => department.code === code);
