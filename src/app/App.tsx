import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { ComparePage, DepartmentPage, MunicipalitiesPage, NotFoundPage } from "./pages";
import { RadarAccessPage } from "./RadarAccessPage";
import { MunicipalDashboard } from "../components/MunicipalDashboard";

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
    <Routes>
      <Route path="municipio/:municipalityCode/:section?" element={<MunicipalDashboard />} />
      <Route element={<Layout />}>
        <Route index element={<MunicipalitiesPage />} />
        <Route path="municipios" element={<MunicipalitiesPage />} />
        <Route path="departamento/:departmentCode" element={<DepartmentPage />} />
        <Route path="comparar" element={<ComparePage />} />
        <Route path="acceso" element={<RadarAccessPage />} />
        <Route path="admin" element={<Navigate to="/acceso-restringido" replace />} />
        <Route path="acceso-restringido" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
