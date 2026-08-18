import { Route, Routes } from "react-router-dom";
import { Layout } from "./Layout";
import { AdminPage, ComparePage, DepartmentPage, MunicipalityPage, NationalPage, NotFoundPage } from "./pages";

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NationalPage />} />
        <Route path="departamento/:departmentCode" element={<DepartmentPage />} />
        <Route path="municipio/:municipalityCode" element={<MunicipalityPage />} />
        <Route path="comparar" element={<ComparePage />} />
        <Route path="admin" element={<AdminPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
