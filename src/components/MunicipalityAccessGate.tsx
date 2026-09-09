import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { resolveAuthorizedRadarConsumer, type AuthorizedRadarConsumer } from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import {
  clearInstalledRadarGeoBundle,
  clearInstalledRadarRuntime,
  installRadarGeoBundle,
  installRadarRuntime,
} from "../data/radarRuntimeCache";
import { loadAuthorizedGeoBundle, type MunicipalityGeoBundle } from "../data/radarRuntime";
import { MunicipalDashboard as CanonicalMunicipalDashboard } from "./MunicipalDashboard";

type GateState =
  | { status: "loading" }
  | { status: "authorized"; consumer: AuthorizedRadarConsumer }
  | { status: "auth_required" }
  | { status: "forbidden" };

const AuthorizedRuntimeContext = createContext<AuthorizedRadarConsumer | null>(null);
const MAP_PUBLIC_FEATURE_TYPES = ["populated_place", "tse_voting_center", "school", "health_facility"];

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("RADAR_AUTH_REQUIRED") || message.includes("RADAR_AUTH_401") || message.includes("(401)");
}

function AuthorizedRuntimeProvider({ consumer, children }: { consumer: AuthorizedRadarConsumer; children: ReactNode }) {
  return <AuthorizedRuntimeContext.Provider value={consumer}>{children}</AuthorizedRuntimeContext.Provider>;
}

export function useAuthorizedRadarRuntime() {
  const context = useContext(AuthorizedRuntimeContext);
  if (!context) throw new Error("RADAR_AUTHORIZED_RUNTIME_REQUIRED");
  return context;
}

export function MunicipalityAccessGate() {
  const { municipalityCode, section } = useParams();
  const location = useLocation();
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) {
      setState({ status: "forbidden" });
      return () => {
        cancelled = true;
      };
    }

    clearInstalledRadarRuntime(municipalityCode);
    clearInstalledRadarGeoBundle(municipalityCode);
    setState({ status: "loading" });
    ensureRadarAccessToken()
      .then(async (accessToken) => {
        const consumer = await resolveAuthorizedRadarConsumer(municipalityCode, accessToken);
        const geoBundle: MunicipalityGeoBundle | null = section === "mapa"
          ? await loadAuthorizedGeoBundle(municipalityCode, accessToken, MAP_PUBLIC_FEATURE_TYPES)
          : null;
        return { consumer, geoBundle };
      })
      .then(({ consumer, geoBundle }) => {
        if (cancelled) return;
        installRadarRuntime(consumer.runtime);
        if (geoBundle) installRadarGeoBundle(geoBundle);
        setState({ status: "authorized", consumer });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clearInstalledRadarRuntime(municipalityCode);
        clearInstalledRadarGeoBundle(municipalityCode);
        if (isAuthenticationFailure(error)) {
          clearRadarSession();
          setState({ status: "auth_required" });
          return;
        }
        setState({ status: "forbidden" });
      });

    return () => {
      cancelled = true;
      clearInstalledRadarRuntime(municipalityCode);
      clearInstalledRadarGeoBundle(municipalityCode);
    };
  }, [municipalityCode, section]);

  if (state.status === "loading") {
    return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>Verificando acceso…</h1></div>;
  }

  if (state.status === "auth_required") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/acceso?next=${next}`} replace />;
  }

  if (state.status === "forbidden") {
    return <Navigate to="/acceso-restringido" replace />;
  }

  return (
    <AuthorizedRuntimeProvider consumer={state.consumer}>
      <CanonicalMunicipalDashboard />
    </AuthorizedRuntimeProvider>
  );
}
