import { createContext, useContext, type ReactNode } from "react";
import type { RadarMunicipalConsumer, UserRole } from "../types/radar";

export interface MunicipalityRuntimeContext {
  country_code: string;
  municipality_code: string;
  municipality_name: string;
  department_code: string;
  department_name: string;
  campaign_id: string;
  user_role: UserRole;
  permissions: string[];
  consumer: RadarMunicipalConsumer;
  refresh: () => Promise<void>;
}

const MunicipalityContext = createContext<MunicipalityRuntimeContext | null>(null);

export function MunicipalityProvider({ consumer, refresh, children }: { consumer: RadarMunicipalConsumer; refresh: () => Promise<void>; children: ReactNode }) {
  const value: MunicipalityRuntimeContext = {
    country_code: consumer.context.country_code,
    municipality_code: consumer.municipality.code,
    municipality_name: consumer.municipality.displayName ?? consumer.municipality.name,
    department_code: consumer.municipality.departmentCode,
    department_name: consumer.municipality.department,
    campaign_id: consumer.context.campaign_id,
    user_role: consumer.context.user_role,
    permissions: consumer.context.permissions,
    consumer,
    refresh,
  };

  return <MunicipalityContext.Provider value={value}>{children}</MunicipalityContext.Provider>;
}

export function useMunicipalityContext() {
  const context = useContext(MunicipalityContext);
  if (!context) throw new Error("MunicipalityContext debe usarse dentro de MunicipalityProvider");
  return context;
}
