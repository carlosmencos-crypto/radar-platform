import { lazy, Suspense } from "react";
import { Link, Navigate, Route, Routes } from "react-router-dom";
import { LoginPage } from "../auth/LoginPage";
import { RequireAuth } from "../auth/RequireAuth";
import { Layout } from "./Layout";
import { ComparePage, DepartmentPage, MunicipalitiesPage, NotFoundPage } from "./pages";

const MunicipalDashboard = lazy(async () => {
  const module = await import("../components/MunicipalDashboard");
  return { default: module.MunicipalDashboard };
});

function AccessDeniedPage() {
  return (
    <div className="page page--compact">
      <span className="eyebrow">Acceso restringido</span>
      <h1>Esta área no está disponible.</h1>
      <p className="lede">
        La consola interna de RADAR permanece cerrada hasta que una sesión autenticada y autorizada
        pueda verificarse en el servidor.
      </p>
      <Link className="button" to="/">Volver al centro nacional</Link>
    </div>
  );
}

export function App() {
  return (
    <Suspense fallback={<div className="auth-loading" role="status">Cargando RADAR…</div>}><Routes>
      <Route path="login" element={<LoginPage />} />
      <Route element={<RequireAuth />}>
        <Route path="municipio/:municipalityCode/:section?" element={<MunicipalDashboard routeKind="municipality" />} />
        <Route path="demo/valle-nexo/:section?" element={<MunicipalDashboard routeKind="demo" />} />
      </Route>
      <Route element={<Layout />}>
        <Route index element={<MunicipalitiesPage />} />
        <Route path="municipios" element={<MunicipalitiesPage />} />
        <Route path="departamento/:departmentCode" element={<DepartmentPage />} />
        <Route element={<RequireAuth />}><Route path="comparar" element={<ComparePage />} /></Route>
        <Route path="admin" element={<Navigate to="/acceso-restringido" replace />} />
        <Route path="acceso-restringido" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes></Suspense>
  );
}
