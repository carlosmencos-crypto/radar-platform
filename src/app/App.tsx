import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { ComparePage, DepartmentPage, NationalPage, NotFoundPage } from "./pages";
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
        <Route index element={<NationalPage />} />
        <Route path="departamento/:departmentCode" element={<DepartmentPage />} />
        <Route path="comparar" element={<ComparePage />} />
        <Route path="admin" element={<Navigate to="/acceso-restringido" replace />} />
        <Route path="acceso-restringido" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
