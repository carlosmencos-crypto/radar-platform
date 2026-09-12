import { useEffect, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { AuthorizedRuntimeProvider } from "../context/AuthorizedRuntimeContext";
import { resolveAuthorizedRadarConsumer, type AuthorizedRadarConsumer } from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import { assertGeoBundleMatchesRuntime, RADAR_PUBLIC_MAP_FEATURE_TYPES } from "../data/radarGeoRuntime";
import {
  clearInstalledRadarGeoBundle,
  clearInstalledRadarRuntime,
  installRadarGeoBundle,
  installRadarRuntime,
} from "../data/radarRuntimeCache";
import { loadAuthorizedGeoBundle, type MunicipalityGeoBundle } from "../data/radarRuntime";
import { MunicipalDashboardV70Runtime } from "./MunicipalDashboardV70Runtime";

type GateState =
  | { status: "loading" }
  | { status: "authorized"; consumer: AuthorizedRadarConsumer }
  | { status: "auth_required" }
  | { status: "runtime_error" }
  | { status: "forbidden" };

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("RADAR_AUTH_REQUIRED") || message.includes("RADAR_AUTH_401") || message.includes("(401)");
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadMunicipalityRuntime(municipalityCode: string, section: string | undefined, accessToken: string) {
  const consumer = await resolveAuthorizedRadarConsumer(municipalityCode, accessToken);
  const geoBundle: MunicipalityGeoBundle | null = section === "mapa"
    ? await loadAuthorizedGeoBundle(municipalityCode, accessToken, [...RADAR_PUBLIC_MAP_FEATURE_TYPES])
    : null;
  return { consumer, geoBundle };
}

export function MunicipalityAccessGate() {
  const { municipalityCode, section } = useParams();
  const location = useLocation();
  const [state, setState] = useState<GateState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    if (!municipalityCode || !/^\d{4}$/.test(municipalityCode)) {
      setState({ status: "forbidden" });
      return () => { cancelled = true; };
    }

    clearInstalledRadarRuntime(municipalityCode);
    clearInstalledRadarGeoBundle(municipalityCode);
    setState({ status: "loading" });

    ensureRadarAccessToken()
      .then(async (accessToken) => {
        try {
          return await loadMunicipalityRuntime(municipalityCode, section, accessToken);
        } catch (error) {
          if (isAuthenticationFailure(error)) throw error;
          await delay(250);
          return loadMunicipalityRuntime(municipalityCode, section, accessToken);
        }
      })
      .then(({ consumer, geoBundle }) => {
        if (cancelled) return;
        installRadarRuntime(consumer.runtime);
        if (geoBundle) {
          assertGeoBundleMatchesRuntime(consumer.runtime, geoBundle);
          installRadarGeoBundle(geoBundle);
        }
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
        setState({ status: "runtime_error" });
      });

    return () => {
      cancelled = true;
      clearInstalledRadarRuntime(municipalityCode);
      clearInstalledRadarGeoBundle(municipalityCode);
    };
  }, [municipalityCode, section]);

  if (state.status === "loading") {
    return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>Actualizando municipio…</h1></div>;
  }

  if (state.status === "auth_required") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/acceso?next=${next}`} replace />;
  }

  if (state.status === "runtime_error") {
    return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>No pudimos actualizar este municipio.</h1><p>Tu acceso sigue activo. Reintentá la carga para recuperar la información municipal.</p><button type="button" onClick={() => window.location.reload()}>Reintentar</button></div>;
  }

  if (state.status === "forbidden") {
    return <Navigate to="/acceso-restringido" replace />;
  }

  return <AuthorizedRuntimeProvider consumer={state.consumer}><MunicipalDashboardV70Runtime /></AuthorizedRuntimeProvider>;
}
