import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { AuthorizedRuntimeProvider } from "../context/AuthorizedRuntimeContext";
import {
  resolveAuthorizedRadarConsumer,
  type AuthorizedRadarConsumer,
} from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import { assertDemoContext } from "../data/radarDemo";
import {
  assertGeoBundleMatchesRuntime,
  RADAR_PUBLIC_MAP_FEATURE_TYPES,
} from "../data/radarGeoRuntime";
import {
  clearInstalledRadarElectoralLayers,
  clearInstalledRadarGeoBundle,
  clearInstalledRadarRuntime,
  clearInstalledRadarVoterCommunities,
  getInstalledRadarRuntime,
  installRadarElectoralLayers,
  installRadarGeoBundle,
  installRadarRuntime,
  installRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import {
  loadAuthorizedElectoralTerritoryLayers,
  loadAuthorizedGeoBundle,
  loadAuthorizedVoterCommunities,
  loadAuthorizedRadarContext,
} from "../data/radarRuntime";
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
  demoRequested: boolean,
) {
  const routeKind = demoRequested ? "demo" : "municipality";
  const [consumer, geoBundle, electoralLayers, voterCommunities] =
    await Promise.all([
      resolveAuthorizedRadarConsumer(municipalityCode, accessToken, routeKind),
      loadAuthorizedGeoBundle(municipalityCode, accessToken, [
        ...RADAR_PUBLIC_MAP_FEATURE_TYPES,
      ], routeKind),
      loadAuthorizedElectoralTerritoryLayers(municipalityCode, accessToken, routeKind),
      loadAuthorizedVoterCommunities(municipalityCode, accessToken, routeKind),
    ]);
  return { consumer, geoBundle, electoralLayers, voterCommunities };
}

function directV70(section: string | undefined): ReactNode | null {
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
  const queryDemoRequested = new URLSearchParams(location.search).get("demo") === "1";
  const installedRuntime = getInstalledRadarRuntime(municipalityCode);
  const stickyDemoRequested =
    !queryDemoRequested && installedRuntime?.context.is_demo === true;
  const demoRequested = queryDemoRequested || stickyDemoRequested;
  const [demoUnavailable, setDemoUnavailable] = useState(false);
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
    setDemoUnavailable(false);

    ensureRadarAccessToken()
      .then(async (accessToken) => {
        let demoCampaign: string | undefined;
        if (demoRequested) {
          const context = await loadAuthorizedRadarContext(municipalityCode, accessToken, "demo");
          assertDemoContext(context, municipalityCode);
          demoCampaign = context.campaign_id!;
        }
        const load = async () => {
          const bundle = await loadMunicipalityRuntime(municipalityCode, accessToken, demoRequested);
          if (demoRequested) assertDemoContext(bundle.consumer.runtime.context, municipalityCode, demoCampaign);
          return bundle;
        };
        try {
          return await load();
        } catch (error) {
          if (isAuthenticationFailure(error)) throw error;
          await delay(250);
          return load();
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
        if (error instanceof Error && error.message === "RADAR_DEMO_CONTEXT_REQUIRED") {
          setDemoUnavailable(true);
          setState({ status: "forbidden" });
          return;
        }
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
  }, [municipalityCode, demoRequested]);

  if (stickyDemoRequested) {
    const demoParams = new URLSearchParams(location.search);
    demoParams.set("demo", "1");
    return (
      <Navigate
        to={`${location.pathname}?${demoParams.toString()}${location.hash}`}
        replace
      />
    );
  }

  if (demoUnavailable) return <div className="page page--compact"><span className="eyebrow">DEMO</span><h1>Demo pendiente de habilitación</h1><p>Esta cuenta todavía no tiene un espacio de demostración autorizado para este municipio. No se abrió el espacio de un cliente real.</p></div>;

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

  const direct = directV70(section);
  if (demoRequested && state.consumer.runtime.context.is_demo !== true) return <div className="page page--compact"><span className="eyebrow">DEMO</span><h1>Verificando acceso demo…</h1></div>;
  if (direct)
    return (
      <AuthorizedRuntimeProvider consumer={state.consumer}>
        {state.consumer.runtime.context.is_demo === true ? <span className="radar-demo-badge" role="status">DEMO</span> : null}
        {direct}
      </AuthorizedRuntimeProvider>
    );

  return <Navigate to={`/municipio/${municipalityCode}/inicio${demoRequested ? "?demo=1" : ""}`} replace />;
}
