import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { StatusBadge } from "../components/StatusBadge";
import { departments, findDepartment } from "../data/departments";
import { findMunicipality, municipalities } from "../data/municipalities";

const formatNumber = (value?: number) =>
  value ? new Intl.NumberFormat("es-GT").format(value) : "Pendiente";

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function NationalPage() {
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return departments;
    return departments.filter((department) =>
      normalize(`${department.name} ${department.code}`).includes(term),
    );
  }, [query]);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <span className="eyebrow">Guatemala · cobertura nacional</span>
          <h1>Decisiones territoriales con evidencia.</h1>
          <p>Un centro único para navegar departamentos, municipios, comparables y datos validados.</p>
          <div className="hero__actions">
            <Link className="button" to="/municipio/0509">Abrir piloto 0509</Link>
            <Link className="button button--ghost" to="/comparar">Comparar municipios</Link>
          </div>
        </div>
        <div className="pulse-card">
          <span>Arquitectura territorial</span>
          <strong>340</strong>
          <p>municipios en una sola plataforma</p>
          <div className="progress"><i style={{ width: "4.4%" }} /></div>
          <small>22 departamentos · 15 municipios en procesamiento · 1 validado</small>
        </div>
      </section>

      <section className="section">
        <div className="section__heading directory-heading">
          <div><span className="eyebrow">Directorio nacional</span><h2>22 departamentos</h2></div>
          <label className="territory-search">
            <span>Buscar territorio</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Departamento o código"
              type="search"
            />
          </label>
        </div>
        <div className="department-grid">
          {results.map((department) => (
            <Link className="department-card" to={`/departamento/${department.code}`} key={department.code}>
              <small>{department.code}</small>
              <h3>{department.name}</h3>
              <p>{department.municipalityCount} municipios</p>
              <span>Abrir departamento →</span>
            </Link>
          ))}
        </div>
        {!results.length && <p className="empty-state">No encontramos un departamento con ese nombre o código.</p>}
      </section>

      <section className="section">
        <div className="section__heading">
          <div><span className="eyebrow">Prioridad actual</span><h2>Escuintla</h2></div>
          <Link to="/departamento/05">Ver departamento →</Link>
        </div>
        <div className="territory-grid">
          {municipalities.map((municipality) => (
            <Link className="territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
              <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
              <h3>{municipality.name}</h3>
              <p>{municipality.department}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function DepartmentPage() {
  const { departmentCode } = useParams();
  const department = findDepartment(departmentCode);
  if (!department) return <NotFoundPage />;
  const items = municipalities.filter((m) => m.departmentCode === departmentCode);
  return (
    <div className="page page--compact">
      <span className="eyebrow">Departamento {department.code}</span>
      <h1>{department.name}</h1>
      <p className="lede">{department.municipalityCount} municipios · navegación departamental y disponibilidad de datos.</p>
      {items.length ? (
        <div className="territory-grid">
          {items.map((m) => (
            <Link className="territory-card" to={`/municipio/${m.code}`} key={m.code}>
              <div><small>{m.code}</small><StatusBadge status={m.coverage} /></div>
              <h3>{m.name}</h3><p>Abrir expediente municipal</p>
            </Link>
          ))}
        </div>
      ) : (
        <section className="empty-panel">
          <span className="eyebrow">Cobertura en preparación</span>
          <h2>La ruta departamental ya está activa</h2>
          <p>Los municipios se incorporarán desde el catálogo territorial canónico sin crear páginas independientes.</p>
          <Link to="/">Volver al directorio nacional →</Link>
        </section>
      )}
    </div>
  );
}

export function MunicipalityPage() {
  const { municipalityCode } = useParams();
  const municipality = findMunicipality(municipalityCode);
  if (!municipality) return <NotFoundPage />;
  return (
    <div className="page page--compact">
      <div className="title-row">
        <div>
          <span className="eyebrow">{municipality.department} · {municipality.code}</span>
          <h1>{municipality.name}</h1>
        </div>
        <StatusBadge status={municipality.coverage} />
      </div>
      <div className="metric-grid">
        <article><span>Proyección 2026</span><strong>{formatNumber(municipality.population)}</strong><small>habitantes</small></article>
        <article><span>Padrón 2026</span><strong>{formatNumber(municipality.electors)}</strong><small>electores</small></article>
        <article><span>Actualización</span><strong>{municipality.lastUpdated ?? "Pendiente"}</strong><small>fecha de corte</small></article>
      </div>
      <section className="placeholder">
        <span className="eyebrow">Expediente Municipal 360</span>
        <h2>Base lista para integrar módulos y datos validados</h2>
        <p>Demografía, elecciones, territorio, educación, salud, finanzas, obras y fuentes se conectarán mediante adaptadores reutilizables.</p>
      </section>
    </div>
  );
}

export function ComparePage() {
  return (
    <div className="page page--compact">
      <span className="eyebrow">Comparación territorial</span>
      <h1>Comparar municipios</h1>
      <p className="lede">La estructura está preparada para seleccionar municipios e indicadores comparables sin mezclar períodos ni universos.</p>
      <section className="placeholder"><h2>Selector comparativo</h2><p>Siguiente fase: filtros, tabla, visualizaciones y exportación.</p></section>
    </div>
  );
}

export function AdminPage() {
  return (
    <div className="page page--compact">
      <span className="eyebrow">Acceso interno</span>
      <h1>Consola nacional RADAR</h1>
      <p className="lede">Control de cobertura, validación, trazabilidad y publicación, separado del producto privado de campaña.</p>
      <section className="placeholder"><h2>Área protegida</h2><p>La autenticación y los permisos se incorporarán antes de conectar información privada.</p></section>
    </div>
  );
}

export function NotFoundPage() {
  return <div className="page page--compact"><span className="eyebrow">404</span><h1>Ruta no encontrada</h1><Link to="/">Volver al centro nacional</Link></div>;
}
