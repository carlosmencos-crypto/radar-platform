import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { AuthorizedRuntimeProvider } from "../context/AuthorizedRuntimeContext";
import {
  resolveAuthorizedRadarConsumer,
  type AuthorizedRadarConsumer,
} from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import {
  assertGeoBundleMatchesRuntime,
  RADAR_PUBLIC_MAP_FEATURE_TYPES,
} from "../data/radarGeoRuntime";
import {
  clearInstalledRadarElectoralLayers,
  clearInstalledRadarGeoBundle,
  clearInstalledRadarRuntime,
  clearInstalledRadarVoterCommunities,
  installRadarElectoralLayers,
  installRadarGeoBundle,
  installRadarRuntime,
  installRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import {
  loadAuthorizedElectoralTerritoryLayers,
  loadAuthorizedGeoBundle,
  loadAuthorizedVoterCommunities,
} from "../data/radarRuntime";
import { MunicipalDashboardV70Runtime } from "./MunicipalDashboardV70Runtime";
import { V70DirectAgenda0509 } from "./V70DirectAgenda0509";
import { V70DirectAi0509 } from "./V70DirectAi0509";
import { V70DirectConfiguration0509 } from "./V70DirectConfiguration0509";
import { V70DirectDayD0509 } from "./V70DirectDayD0509";
import { V70DirectDirectory0509 } from "./V70DirectDirectory0509";
import { V70DirectHome0509 } from "./V70DirectHome0509";
import { V70DirectIntelligence0509 } from "./V70DirectIntelligence0509";
import { V70DirectMap0509 } from "./V70DirectMap0509";
import { V70DirectPulse0509 } from "./V70DirectPulse0509";
import { V70DirectResources0509 } from "./V70DirectResources0509";
import { V70DirectStrategy0509 } from "./V70DirectStrategy0509";
import { V70DirectStrategyArea0509 } from "./V70DirectStrategyArea0509";

type GateState =
  | { status: "loading" }
  | { status: "authorized"; consumer: AuthorizedRadarConsumer }
  | { status: "auth_required" }
  | { status: "runtime_error" }
  | { status: "forbidden" };

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("RADAR_AUTH_REQUIRED") ||
    message.includes("RADAR_AUTH_401") ||
    message.includes("(401)")
  );
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function loadMunicipalityRuntime(
  municipalityCode: string,
  accessToken: string,
) {
  const [consumer, geoBundle, electoralLayers, voterCommunities] =
    await Promise.all([
      resolveAuthorizedRadarConsumer(municipalityCode, accessToken),
      loadAuthorizedGeoBundle(municipalityCode, accessToken, [
        ...RADAR_PUBLIC_MAP_FEATURE_TYPES,
      ]),
      loadAuthorizedElectoralTerritoryLayers(municipalityCode, accessToken),
      loadAuthorizedVoterCommunities(municipalityCode, accessToken),
    ]);
  return { consumer, geoBundle, electoralLayers, voterCommunities };
}

function direct0509(section: string | undefined): ReactNode | null {
  if (!section || section === "inicio") return <V70DirectHome0509 />;
  if (section === "inteligencia") return <V70DirectIntelligence0509 />;
  if (section === "estrategia") return <V70DirectStrategy0509 />;
  if (
    section === "estrategia-plan" ||
    section === "estrategia-comunicacion" ||
    section === "estrategia-finanzas" ||
    section === "estrategia-legal"
  )
    return <V70DirectStrategyArea0509 />;
  if (section === "directorio") return <V70DirectDirectory0509 />;
  if (section === "agenda") return <V70DirectAgenda0509 />;
  if (section === "mapa") return <V70DirectMap0509 />;
  if (section === "dia-d") return <V70DirectDayD0509 />;
  if (section === "recursos") return <V70DirectResources0509 />;
  if (section === "pulso") return <V70DirectPulse0509 />;
  if (section === "ia-radar") return <V70DirectAi0509 />;
  if (section === "configuracion") return <V70DirectConfiguration0509 />;
  return null;
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
    clearInstalledRadarElectoralLayers(municipalityCode);
    clearInstalledRadarVoterCommunities(municipalityCode);
    setState({ status: "loading" });

    ensureRadarAccessToken()
      .then(async (accessToken) => {
        try {
          return await loadMunicipalityRuntime(municipalityCode, accessToken);
        } catch (error) {
          if (isAuthenticationFailure(error)) throw error;
          await delay(250);
          return loadMunicipalityRuntime(municipalityCode, accessToken);
        }
      })
      .then(({ consumer, geoBundle, electoralLayers, voterCommunities }) => {
        if (cancelled) return;
        installRadarRuntime(consumer.runtime);
        assertGeoBundleMatchesRuntime(consumer.runtime, geoBundle);
        installRadarGeoBundle(geoBundle);
        installRadarElectoralLayers(municipalityCode, electoralLayers);
        installRadarVoterCommunities(municipalityCode, voterCommunities);
        setState({ status: "authorized", consumer });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        clearInstalledRadarRuntime(municipalityCode);
        clearInstalledRadarGeoBundle(municipalityCode);
        clearInstalledRadarElectoralLayers(municipalityCode);
        clearInstalledRadarVoterCommunities(municipalityCode);
        if (isAuthenticationFailure(error)) {
          clearRadarSession();
          setState({ status: "auth_required" });
          return;
        }
        console.error(
          "RADAR_MUNICIPAL_RUNTIME_LOAD_FAILED",
          municipalityCode,
          section ?? "inicio",
          error,
        );
        setState({ status: "runtime_error" });
      });

    return () => {
      cancelled = true;
      clearInstalledRadarRuntime(municipalityCode);
      clearInstalledRadarGeoBundle(municipalityCode);
      clearInstalledRadarElectoralLayers(municipalityCode);
      clearInstalledRadarVoterCommunities(municipalityCode);
    };
  }, [municipalityCode]);

  if (state.status === "loading") {
    return (
      <div className="page page--compact">
        <span className="eyebrow">RADAR</span>
        <h1>Actualizando municipio…</h1>
      </div>
    );
  }

  if (state.status === "auth_required") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/acceso?next=${next}`} replace />;
  }

  if (state.status === "runtime_error") {
    return (
      <div className="page page--compact">
        <span className="eyebrow">RADAR</span>
        <h1>No pudimos actualizar este municipio.</h1>
        <p>
          Tu acceso sigue activo. Reintentá la carga para recuperar la
          información municipal.
        </p>
        <button type="button" onClick={() => window.location.reload()}>
          Reintentar
        </button>
      </div>
    );
  }

  if (state.status === "forbidden") {
    return <Navigate to="/acceso-restringido" replace />;
  }

  if (municipalityCode === "0509") {
    const direct = direct0509(section);
    if (direct)
      return (
        <AuthorizedRuntimeProvider consumer={state.consumer}>
          {direct}
        </AuthorizedRuntimeProvider>
      );
  }

  return (
    <AuthorizedRuntimeProvider consumer={state.consumer}>
      <MunicipalDashboardV70Runtime />
    </AuthorizedRuntimeProvider>
  );
}
