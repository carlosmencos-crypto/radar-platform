export type PulseElectionType =
  | "ALCALDIA"
  | "PRESIDENTE"
  | "DIP_NAC"
  | "DIP_DIST"
  | "PARLACEN";

export type PulseScopeType = "MUNICIPALITY" | "DEPARTMENT" | "NATIONAL";
export type PulsePublicationStatus = "BORRADOR" | "PUBLICADA" | "ARCHIVADA";

export interface PulseViewerScope {
  countryCode: string;
  departmentCode: string;
  municipalityCode: string;
}

export interface PulseMeasurementScope {
  electionType: PulseElectionType;
  scopeType: PulseScopeType;
  countryCode: string;
  departmentCode: string | null;
  municipalityCode: string | null;
  status: PulsePublicationStatus;
}

export const pulseElectionScopes: Readonly<Record<PulseElectionType, PulseScopeType>> = {
  ALCALDIA: "MUNICIPALITY",
  PRESIDENTE: "NATIONAL",
  DIP_NAC: "NATIONAL",
  DIP_DIST: "DEPARTMENT",
  PARLACEN: "NATIONAL",
};

export function pulseScopeForElection(electionType: PulseElectionType) {
  return pulseElectionScopes[electionType];
}

export function canViewPulseMeasurement(
  viewer: PulseViewerScope,
  measurement: PulseMeasurementScope,
) {
  if (measurement.status !== "PUBLICADA") return false;
  if (measurement.countryCode !== viewer.countryCode) return false;
  if (measurement.scopeType !== pulseScopeForElection(measurement.electionType)) return false;

  if (measurement.scopeType === "MUNICIPALITY") {
    return measurement.municipalityCode === viewer.municipalityCode;
  }
  if (measurement.scopeType === "DEPARTMENT") {
    return measurement.departmentCode === viewer.departmentCode;
  }
  return true;
}
