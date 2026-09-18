import { useEffect, useState, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { clearRadarSession } from "../data/radarAuth";
import { loadAdminSnapshot, radarAdminConfigured, type AdminSnapshot } from "./radarAdminApi";
import { SuperAdminApp } from "./SuperAdminApp";
import "../styles/superadmin.css";

type GateState =
  | { status: "loading" }
  | { status: "ready"; snapshot: AdminSnapshot }
  | { status: "error"; code: string; requestId?: string };

function messageFor(code: string) {
  if (code === "RADAR_ADMIN_NOT_CONFIGURED") return "La API administrativa no está configurada en este ambiente.";
  if (code === "RADAR_AUTH_REQUIRED" || code === "AUTH_REQUIRED" || code === "AUTH_INVALID") return "Necesitas iniciar sesión para entrar a la consola.";
  if (code === "MFA_AAL2_REQUIRED") return "La consola exige verificación MFA para esta sesión.";
  if (code === "ADMIN_ROLE_REQUIRED" || code.includes("permission") || code.includes("scope")) return "Tu cuenta no tiene el rol o alcance necesario para esta consola.";
  return "No fue posible verificar el control-plane administrativo.";
}

export function SuperAdminAccessGate() {
  const location = useLocation();
  const [gate, setGate] = useState<GateState>({ status: "loading" });

  async function refresh() {
    setGate({ status: "loading" });
    try {
      const snapshot = await loadAdminSnapshot();
      setGate({ status: "ready", snapshot });
    } catch (error) {
      const candidate = error as Error & { requestId?: string };
      setGate({ status: "error", code: candidate.message, requestId: candidate.requestId });
    }
  }

  useEffect(() => { void refresh(); }, []);

  if (!radarAdminConfigured()) {
    return <AdminGateNotice title="Ambiente sin backend QA" detail={messageFor("RADAR_ADMIN_NOT_CONFIGURED")} />;
  }
  if (gate.status === "loading") {
    return <div className="superadmin-gate"><div className="superadmin-loader" /><p>Verificando sesión, MFA, rol y alcance…</p></div>;
  }
  if (gate.status === "error") {
    const authError = ["RADAR_AUTH_REQUIRED", "AUTH_REQUIRED", "AUTH_INVALID", "MFA_AAL2_REQUIRED"].includes(gate.code);
    return (
      <AdminGateNotice title="Acceso administrativo detenido" detail={messageFor(gate.code)} requestId={gate.requestId}>
        {authError ? (
          <Link className="superadmin-primary-link" to={`/acceso?next=${encodeURIComponent(location.pathname)}`} onClick={() => clearRadarSession()}>
            Verificar acceso
          </Link>
        ) : <button type="button" onClick={() => void refresh()}>Reintentar verificación</button>}
      </AdminGateNotice>
    );
  }
  return <SuperAdminApp snapshot={gate.snapshot} onRefresh={refresh} />;
}

function AdminGateNotice({ title, detail, requestId, children }: {
  title: string; detail: string; requestId?: string; children?: ReactNode;
}) {
  const logo = `${import.meta.env.BASE_URL}brand/radar-electoral-logo-horizontal-claro.svg`;
  return (
    <main className="superadmin-gate">
      <img src={logo} alt="RADAR Inteligencia Electoral" />
      <span>SUPERADMINISTRADOR NACIONAL</span>
      <h1>{title}</h1>
      <p>{detail}</p>
      {requestId ? <small>Referencia: {requestId}</small> : null}
      <div>{children}</div>
    </main>
  );
}
