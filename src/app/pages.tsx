import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MunicipalProfile } from "../components/MunicipalProfile";
import { StatusBadge } from "../components/StatusBadge";
import { TerritorialMap0509 } from "../components/TerritorialMap0509";
import { departments, findDepartment } from "../data/departments";
import { findMunicipalProfile } from "../data/municipalProfiles";
import { findMunicipality, municipalities } from "../data/municipalities";

const formatNumber = (value?: number | null) =>
  value === null || value === undefined
    ? "Pendiente"
    : new Intl.NumberFormat("es-GT").format(value);

const normalize = (value: string) =>
  value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

export function NationalPage() {
  const [query, setQuery] = useState("");
  const term = normalize(query.trim());
  const departmentResults = useMemo(() => {
    if (!term) return departments;
    return departments.filter((department) =>
      normalize(`${department.name} ${department.code}`).includes(term),
    );
  }, [term]);
  const municipalityResults = useMemo(() => {
    if (!term) return [];
    return municipalities.filter((municipality) =>
      normalize(`${municipality.name} ${municipality.department} ${municipality.code}`).includes(term),
    ).slice(0, 18);
  }, [term]);
  const catalogMunicipalities = useMemo(
    () =>
      [...municipalities].sort((a, b) => {
        const departmentOrder = a.departmentCode.localeCompare(b.departmentCode);
        if (departmentOrder !== 0) return departmentOrder;
        const municipalityOrder = normalize(a.name).localeCompare(normalize(b.name), "es-GT");
        if (municipalityOrder !== 0) return municipalityOrder;
        return a.code.localeCompare(b.code);
      }),
    [],
  );

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
          <p>municipios navegables en una sola plataforma</p>
          <div className="progress"><i style={{ width: "100%" }} /></div>
          <small>22 departamentos · 340 rutas activas · contrato nacional 340×17</small>
        </div>
      </section>

      <section className="section">
        <div className="section__heading directory-heading">
          <div><span className="eyebrow">Directorio nacional</span><h2>Encuentra cualquier territorio</h2></div>
          <label className="territory-search">
            <span>Buscar territorio</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Municipio, departamento o código" type="search" />
          </label>
        </div>

        {term && municipalityResults.length > 0 && (
          <>
            <h3 className="result-heading">Municipios</h3>
            <div className="territory-grid search-results">
              {municipalityResults.map((municipality) => (
                <Link className="territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
                  <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
                  <h3>{municipality.name}</h3><p>{municipality.department}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        {departmentResults.length > 0 && (
          <>
            {term && <h3 className="result-heading">Departamentos</h3>}
            <div className="department-grid">
              {departmentResults.map((department) => (
                <Link className="department-card" to={`/departamento/${department.code}`} key={department.code}>
                  <small>{department.code}</small><h3>{department.name}</h3>
                  <p>{department.municipalityCount} municipios</p><span>Abrir departamento →</span>
                </Link>
              ))}
            </div>
          </>
        )}
        {term && !departmentResults.length && !municipalityResults.length && (
          <p className="empty-state">No encontramos un territorio con ese nombre o código.</p>
        )}
      </section>

      <section className="section">
        <div className="section__heading">
          <div><span className="eyebrow">Catálogo nacional</span><h2>Municipios de Guatemala</h2></div>
          <span>{catalogMunicipalities.length} municipios</span>
        </div>
        <div className="territory-grid">
          {catalogMunicipalities.map((municipality) => (
            <Link className="territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
              <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
              <h3>{municipality.name}</h3><p>{municipality.department}</p>
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
      <p className="lede">{items.length} municipios · todas las rutas están activas y muestran su disponibilidad real.</p>
      <div className="territory-grid">
        {items.map((municipality) => (
          <Link className="territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
            <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
            <h3>{municipality.name}</h3><p>Abrir expediente municipal</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function MunicipalityPage() {
  const { municipalityCode } = useParams();
  const municipality = findMunicipality(municipalityCode);
  if (!municipality) return <NotFoundPage />;
  const profile = findMunicipalProfile(municipalityCode);
  return (
    <div className="page page--compact">
      <div className="title-row">
        <div><span className="eyebrow">{municipality.department} · {municipality.code}</span><h1>{municipality.name}</h1></div>
        <StatusBadge status={municipality.coverage} />
      </div>
      <div className="metric-grid">
        <article><span>Proyección 2026</span><strong>{formatNumber(municipality.population)}</strong><small>habitantes</small></article>
        <article><span>Padrón 2026</span><strong>{formatNumber(municipality.electors)}</strong><small>electores</small></article>
        <article><span>Módulos visibles</span><strong>{municipality.visibleModules ?? "Pendiente"}/{municipality.totalModules ?? 17}</strong><small>{municipality.emptyStateModules ?? 0} con estado vacío explícito</small></article>
        <article><span>Actualización</span><strong>{municipality.lastUpdated ?? "Contrato nacional"}</strong><small>fecha de corte</small></article>
      </div>
      {municipality.code === "0509" && <TerritorialMap0509 />}
      {profile ? (
        <MunicipalProfile profile={profile} />
      ) : (
        <section className="empty-panel">
          <span className="eyebrow">Expediente Municipal 360</span>
          <h2>Expediente creado; datos en preparación</h2>
          <p>La ruta municipal está activa. Demografía, elecciones, territorio, educación, salud, finanzas, obras y fuentes se publicarán únicamente después de su validación.</p>
        </section>
      )}
    </div>
  );
}

export function ComparePage() {
  const [firstCode, setFirstCode] = useState("0509");
  const [secondCode, setSecondCode] = useState("0501");
  const selected = [findMunicipality(firstCode), findMunicipality(secondCode)].filter(Boolean);

  return (
    <div className="page page--compact">
      <span className="eyebrow">Comparación territorial</span>
      <h1>Comparar municipios</h1>
      <p className="lede">Selecciona dos municipios. Los indicadores solo aparecen cuando comparten definición y período.</p>
      <div className="compare-selectors">
        <label><span>Municipio A</span><select value={firstCode} onChange={(event) => setFirstCode(event.target.value)}>{municipalities.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.name}, {m.department}</option>)}</select></label>
        <label><span>Municipio B</span><select value={secondCode} onChange={(event) => setSecondCode(event.target.value)}>{municipalities.map((m) => <option key={m.code} value={m.code}>{m.code} · {m.name}, {m.department}</option>)}</select></label>
      </div>
      <div className="comparison-grid">
        {selected.map((municipality) => municipality && (
          <article key={municipality.code}>
            <div><small>{municipality.code} · {municipality.department}</small><StatusBadge status={municipality.coverage} /></div>
            <h2>{municipality.name}</h2>
            <dl><div><dt>Proyección 2026</dt><dd>{formatNumber(municipality.population)}</dd></div><div><dt>Padrón 2026</dt><dd>{formatNumber(municipality.electors)}</dd></div></dl>
            <Link to={`/municipio/${municipality.code}`}>Abrir expediente →</Link>
          </article>
        ))}
      </div>
      {selected.some((municipality) => municipality?.coverage === "pending") && <p className="comparison-note">Los valores pendientes permanecen vacíos; RADAR no imputa información no validada.</p>}
    </div>
  );
}

export function AdminPage() {
  const complete = municipalities.filter((m) => m.coverage === "complete").length;
  const partial = municipalities.filter((m) => m.coverage === "partial").length;
  return (
    <div className="page page--compact">
      <span className="eyebrow">Acceso interno</span><h1>Consola nacional RADAR</h1>
      <p className="lede">Control de cobertura, validación, trazabilidad y publicación, separado del producto privado de campaña.</p>
      <div className="metric-grid"><article><span>Validados</span><strong>{complete}</strong><small>municipios</small></article><article><span>Parciales</span><strong>{partial}</strong><small>municipios</small></article><article><span>Pendientes</span><strong>{340 - complete - partial}</strong><small>municipios</small></article></div>
      <section className="placeholder"><h2>Área protegida</h2><p>La autenticación y los permisos se incorporarán antes de conectar información privada.</p></section>
    </div>
  );
}

export function NotFoundPage() {
  return <div className="page page--compact"><span className="eyebrow">404</span><h1>Ruta no encontrada</h1><Link to="/">Volver al centro nacional</Link></div>;
}
