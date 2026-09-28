import { createContext, useContext, type ReactNode } from "react";
import type { RadarMunicipalConsumer, UserRole } from "../types/radar";

export interface MunicipalityRuntimeContext {
  municipality_code: string;
  municipality_name: string;
  department_code: string;
  department_name: string;
  campaign_id: string;
  user_role: UserRole;
  permissions: string[];
  consumer: RadarMunicipalConsumer;
}

const MunicipalityContext = createContext<MunicipalityRuntimeContext | null>(null);

export function MunicipalityProvider({ consumer, children }: { consumer: RadarMunicipalConsumer; children: ReactNode }) {
  const value: MunicipalityRuntimeContext = {
    municipality_code: consumer.municipality.code,
    municipality_name: consumer.municipality.displayName ?? consumer.municipality.name,
    department_code: consumer.municipality.departmentCode,
    department_name: consumer.municipality.department,
    campaign_id: consumer.context.campaign_id,
    user_role: consumer.context.user_role,
    permissions: consumer.context.permissions,
    consumer,
  };

  return <MunicipalityContext.Provider value={value}>{children}</MunicipalityContext.Provider>;
}

export function useMunicipalityContext() {
  const context = useContext(MunicipalityContext);
  if (!context) throw new Error("MunicipalityContext debe usarse dentro de MunicipalityProvider");
  return context;
}
