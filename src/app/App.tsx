import { Link, Navigate, Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { ComparePage, DepartmentPage, MunicipalityPage, NationalPage, NotFoundPage } from "./pages";

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
      <Route element={<Layout />}>
        <Route index element={<NationalPage />} />
        <Route path="departamento/:departmentCode" element={<DepartmentPage />} />
        <Route path="municipio/:municipalityCode" element={<MunicipalityPage />} />
        <Route path="comparar" element={<ComparePage />} />
        <Route path="admin" element={<Navigate to="/acceso-restringido" replace />} />
        <Route path="acceso-restringido" element={<AccessDeniedPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
