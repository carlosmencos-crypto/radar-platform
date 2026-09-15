import { createContext, useContext, type ReactNode } from "react";
import type { AuthorizedRadarConsumer } from "../data/radarAuthorizedConsumer";

const AuthorizedRuntimeContext = createContext<AuthorizedRadarConsumer | null>(null);

export function AuthorizedRuntimeProvider({ consumer, children }: { consumer: AuthorizedRadarConsumer; children: ReactNode }) {
  return <AuthorizedRuntimeContext.Provider value={consumer}>{children}</AuthorizedRuntimeContext.Provider>;
}

export function useAuthorizedRadarRuntime() {
  const context = useContext(AuthorizedRuntimeContext);
  if (!context) throw new Error("RADAR_AUTHORIZED_RUNTIME_REQUIRED");
  return context;
}
