import { useEffect, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { resolveAuthorizedRadarConsumer } from "../data/radarAuthorizedConsumer";
import { clearRadarSession, ensureRadarAccessToken } from "../data/radarAuth";
import { V70DirectReport0509 } from "./V70DirectReport0509";

type GateState = "loading" | "authorized" | "auth_required" | "forbidden" | "runtime_error";

function isAuthenticationFailure(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes("RADAR_AUTH_REQUIRED") || message.includes("RADAR_AUTH_401") || message.includes("(401)");
}

export function V70DirectReportAccessGate0509() {
  const location = useLocation();
  const [state, setState] = useState<GateState>("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    ensureRadarAccessToken()
      .then((accessToken) => resolveAuthorizedRadarConsumer("0509", accessToken))
      .then((consumer) => {
        if (cancelled) return;
        setState(consumer.municipality.code === "0509" ? "authorized" : "forbidden");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isAuthenticationFailure(error)) {
          clearRadarSession();
          setState("auth_required");
          return;
        }
        console.error("RADAR_V70_REPORT_AUTH_FAILED", error);
        setState("runtime_error");
      });
    return () => { cancelled = true; };
  }, []);

  if (state === "loading") return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>Preparando informe…</h1></div>;
  if (state === "auth_required") {
    const next = encodeURIComponent(`${location.pathname}${location.search}`);
    return <Navigate to={`/acceso?next=${next}`} replace />;
  }
  if (state === "forbidden") return <Navigate to="/acceso-restringido" replace />;
  if (state === "runtime_error") return <div className="page page--compact"><span className="eyebrow">RADAR</span><h1>No pudimos validar este informe.</h1><button type="button" onClick={() => window.location.reload()}>Reintentar</button></div>;
  return <V70DirectReport0509 />;
}
