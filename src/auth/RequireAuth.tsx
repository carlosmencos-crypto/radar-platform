import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { configured, loading, session } = useAuth();
  const location = useLocation();

  if (loading) return <div className="auth-loading" role="status">Verificando sesión segura…</div>;
  if (!configured || !session) {
    const returnTo = `${location.pathname}${location.search}${location.hash}`;
    return <Navigate to={`/login?returnTo=${encodeURIComponent(returnTo)}`} replace />;
  }

  return <Outlet />;
}

