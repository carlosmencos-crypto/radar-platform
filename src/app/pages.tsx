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

const sortMunicipalities = <T extends { code: string; name: string; departmentCode: string }>(items: T[]) =>
  [...items].sort((a, b) => {
    const departmentOrder = a.departmentCode.localeCompare(b.departmentCode);
    if (departmentOrder !== 0) return departmentOrder;
    const codeOrder = a.code.localeCompare(b.code);
    if (codeOrder !== 0) return codeOrder;
    return normalize(a.name).localeCompare(normalize(b.name), "es-GT");
  });

type CatalogMunicipality = (typeof municipalities)[number];

function CatalogMunicipalityCard({ municipality }: { municipality: CatalogMunicipality }) {
  const visible = municipality.visibleModules ?? "—";
  const total = municipality.totalModules ?? 17;
  return (
    <Link
      className="catalog-municipality-card"
      to={`/municipio/${municipality.code}`}
      data-municipality-code={municipality.code}
      data-department-code={municipality.departmentCode}
    >
      <div className="catalog-card-topline">
        <span className="catalog-code">{municipality.code}</span>
        <StatusBadge status={municipality.coverage} />
      </div>
      <div className="catalog-card-copy">
        <h2>{municipality.displayName ?? municipality.name}</h2>
        <p>{municipality.department}</p>
      </div>
      <div className="catalog-card-meta">
        <span><small>Cobertura pública</small><strong>{visible}/{total}</strong></span>
        <b>Abrir municipio <span aria-hidden="true">→</span></b>
      </div>
    </Link>
  );
}

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
            <Link className="button button--ghost" to="/municipios">Explorar 340 municipios</Link>
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

      <section className="section" id="departamentos">
        <div className="section__heading directory-heading">
          <div><span className="eyebrow">Directorio nacional</span><h2>Encuentra cualquier territorio</h2></div>
          <label className="territory-search">
            <span>Buscar territorio</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Municipio, departamento o código" type="search" />
          </label>
        </div>

        {term && municipalityResults.length > 0 && (
          <>
            <h3 className="national-result-heading">Municipios</h3>
            <div className="national-territory-grid search-results">
              {municipalityResults.map((municipality) => (
                <Link className="national-territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
                  <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
                  <h3>{municipality.name}</h3><p>{municipality.department}</p>
                </Link>
              ))}
            </div>
          </>
        )}

        {departmentResults.length > 0 && (
          <>
            {term && <h3 className="national-result-heading">Departamentos</h3>}
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
        <div className="national-territory-grid">
          {catalogMunicipalities.map((municipality) => (
            <Link className="national-territory-card" to={`/municipio/${municipality.code}`} key={municipality.code}>
              <div><small>{municipality.code}</small><StatusBadge status={municipality.coverage} /></div>
              <h3>{municipality.name}</h3><p>{municipality.department}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

export function MunicipalitiesPage() {
  const [query, setQuery] = useState("");
  const [departmentCode, setDepartmentCode] = useState("all");
  const items = useMemo(() => {
    const term = normalize(query.trim());
    return sortMunicipalities(municipalities).filter((municipality) => {
      const matchesDepartment = departmentCode === "all" || municipality.departmentCode === departmentCode;
      const matchesQuery = !term || normalize(`${municipality.code} ${municipality.name} ${municipality.displayName ?? ""} ${municipality.department}`).includes(term);
      return matchesDepartment && matchesQuery;
    });
  }, [departmentCode, query]);

  return (
    <div className="catalog-page">
      <section className="catalog-hero catalog-hero--national">
        <div>
          <Link className="catalog-backlink" to="/">RADAR Guatemala</Link>
          <span className="catalog-eyebrow">Catálogo nacional</span>
          <h1>Municipios de Guatemala</h1>
          <p>Explorá la cobertura pública disponible para cada territorio desde una única plataforma nacional.</p>
        </div>
        <div className="catalog-hero-stats" aria-label="Cobertura nacional">
          <span><strong>340</strong><small>municipios</small></span>
          <span><strong>22</strong><small>departamentos</small></span>
          <span><strong>17</strong><small>capas por municipio</small></span>
        </div>
      </section>

      <section className="catalog-directory" aria-labelledby="catalog-title">
        <div className="catalog-directory-heading">
          <div><span className="catalog-eyebrow">Explorador territorial</span><h2 id="catalog-title">Encontrá cualquier municipio</h2></div>
          <span className="catalog-result-count">{items.length} resultados</span>
        </div>
        <div className="catalog-controls">
          <label className="catalog-search">
            <span>Buscar municipio</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o código municipal" type="search" />
          </label>
          <label className="catalog-filter">
            <span>Departamento</span>
            <select value={departmentCode} onChange={(event) => setDepartmentCode(event.target.value)}>
              <option value="all">Todos los departamentos</option>
              {departments.map((department) => <option key={department.code} value={department.code}>{department.code} · {department.name}</option>)}
            </select>
          </label>
        </div>

        <div className="catalog-department-index" aria-label="Explorar departamentos">
          {departments.map((department) => (
            <Link to={`/departamento/${department.code}`} key={department.code}>
              <small>{department.code}</small><span>{department.name}</span><b>{department.municipalityCount}</b>
            </Link>
          ))}
        </div>

        {items.length > 0 ? (
          <div className="catalog-municipality-grid">
            {items.map((municipality) => <CatalogMunicipalityCard municipality={municipality} key={municipality.code} />)}
          </div>
        ) : (
          <p className="catalog-empty">No encontramos municipios con esos criterios.</p>
        )}
      </section>
    </div>
  );
}

export function DepartmentPage() {
  const { departmentCode } = useParams();
  const [query, setQuery] = useState("");
  const department = findDepartment(departmentCode);
  const departmentItems = useMemo(
    () => sortMunicipalities(municipalities.filter((municipality) => municipality.departmentCode === departmentCode)),
    [departmentCode],
  );
  const items = useMemo(() => {
    const term = normalize(query.trim());
    if (!term) return departmentItems;
    return departmentItems.filter((municipality) => normalize(`${municipality.code} ${municipality.name} ${municipality.displayName ?? ""}`).includes(term));
  }, [departmentItems, query]);

  if (!department) return <NotFoundPage />;
  return (
    <div className="catalog-page">
      <section className="catalog-hero catalog-hero--department">
        <div>
          <Link className="catalog-backlink" to="/municipios">← Catálogo nacional</Link>
          <span className="catalog-eyebrow">Departamento {department.code}</span>
          <h1>{department.name}</h1>
          <p>{departmentItems.length} municipios · Inteligencia electoral disponible por municipio.</p>
        </div>
        <div className="catalog-department-seal" aria-label={`${departmentItems.length} municipios`}>
          <strong>{department.code}</strong>
          <span>{departmentItems.length}</span>
          <small>municipios</small>
        </div>
      </section>

      <section className="catalog-directory" aria-labelledby="department-directory-title">
        <div className="catalog-directory-heading">
          <div><span className="catalog-eyebrow">Directorio departamental</span><h2 id="department-directory-title">Municipios de {department.name}</h2></div>
          <span className="catalog-result-count">{items.length} de {departmentItems.length}</span>
        </div>
        <div className="catalog-controls catalog-controls--department">
          <label className="catalog-search">
            <span>Buscar municipio</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Municipio o código de ${department.name}`} type="search" />
          </label>
        </div>

        {items.length > 0 ? (
          <div className="catalog-municipality-grid">
            {items.map((municipality) => <CatalogMunicipalityCard municipality={municipality} key={municipality.code} />)}
          </div>
        ) : (
          <p className="catalog-empty">No encontramos un municipio con ese nombre o código.</p>
        )}
      </section>
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
