import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { resolveAuthorizedRadarConsumer } from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import type { RadarRuntimeBundle } from "../data/radarRuntime";
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
  runtime: RadarRuntimeBundle;
}

type AuthorizationState =
  | { status: "loading" }
  | { status: "authorized"; consumer: RadarMunicipalConsumer; runtime: RadarRuntimeBundle }
  | { status: "auth_required" }
  | { status: "forbidden" };

const MunicipalityContext = createContext<MunicipalityRuntimeContext | null>(null);

function canonicalUserRole(role: string): UserRole {
  if (role === "platform_admin" || role === "national_admin") return "national_admin";
  if (role === "organization_admin" || role === "campaign_admin" || role === "demo_admin" || role === "municipal_admin") return "municipal_admin";
  if (role === "campaign_operator" || role === "operator" || role === "member") return "campaign_operator";
  if (role === "public_viewer") return "public_viewer";
  throw new Error("RADAR_ROLE_NOT_AUTHORIZED");
}

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("RADAR_AUTH_REQUIRED") || message.includes("RADAR_AUTH_401") || message.includes("(401)");
}

export function MunicipalityProvider({ consumer, children }: { consumer: RadarMunicipalConsumer; children: ReactNode }) {
  const location = useLocation();
  const [authorization, setAuthorization] = useState<AuthorizationState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    setAuthorization({ status: "loading" });

    ensureRadarAccessToken()
      .then((accessToken) => resolveAuthorizedRadarConsumer(consumer.municipality.code, accessToken))
      .then((authorized) => {
        if (cancelled) return;
        const authorizedConsumer: RadarMunicipalConsumer = {
          municipality: authorized.municipality,
          navigation: authorized.navigation,
          runtime_gate: authorized.runtime_gate,
          modules: authorized.modules,
          context: {
            municipality_code: authorized.context.municipality_code,
            campaign_id: authorized.context.campaign_id ?? "",
            user_role: canonicalUserRole(authorized.context.user_role),
            permissions: [...authorized.context.permissions],
          },
        };
        setAuthorization({ status: "authorized", consumer: authorizedConsumer, runtime: authorized.runtime });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isAuthenticationFailure(error)) {
          clearRadarSession();
          setAuthorization({ status: "auth_required" });
          return;
        }
        setAuthorization({ status: "forbidden" });
      });

    return () => {
      cancelled = true;
    };
  }, [consumer.municipality.code]);

  if (authorization.status === "loading") {
    return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>Verificando acceso…</h1></div>;
  }

  if (authorization.status === "auth_required") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/acceso?next=${next}`} replace />;
  }

  if (authorization.status === "forbidden") {
    return <Navigate to="/acceso-restringido" replace />;
  }

  const runtimeConsumer = authorization.consumer;
  const value: MunicipalityRuntimeContext = {
    municipality_code: runtimeConsumer.municipality.code,
    municipality_name: runtimeConsumer.municipality.displayName ?? runtimeConsumer.municipality.name,
    department_code: runtimeConsumer.municipality.departmentCode,
    department_name: runtimeConsumer.municipality.department,
    campaign_id: runtimeConsumer.context.campaign_id,
    user_role: runtimeConsumer.context.user_role,
    permissions: runtimeConsumer.context.permissions,
    consumer: runtimeConsumer,
    runtime: authorization.runtime,
  };

  return <MunicipalityContext.Provider value={value}>{children}</MunicipalityContext.Provider>;
}

export function useMunicipalityContext() {
  const context = useContext(MunicipalityContext);
  if (!context) throw new Error("MunicipalityContext debe usarse dentro de MunicipalityProvider");
  return context;
}
