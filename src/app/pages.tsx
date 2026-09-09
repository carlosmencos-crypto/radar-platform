import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { departments, findDepartment } from "../data/departments";
import { findMunicipality, municipalities } from "../data/municipalities";

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
  return <Link
    className="catalog-municipality-card"
    to={`/municipio/${municipality.code}`}
    data-municipality-code={municipality.code}
    data-department-code={municipality.departmentCode}
  >
    <div className="catalog-card-topline"><span className="catalog-code">{municipality.code}</span></div>
    <div className="catalog-card-copy"><h2>{municipality.displayName ?? municipality.name}</h2><p>{municipality.department}</p></div>
    <div className="catalog-card-meta catalog-card-meta--territorial"><b>Abrir municipio <span aria-hidden="true">→</span></b></div>
  </Link>;
}

export function MunicipalitiesPage() {
  const { departmentCode: routeDepartmentCode } = useParams();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [departmentCode, setDepartmentCode] = useState(() => findDepartment(routeDepartmentCode)?.code ?? "all");
  const activeDepartment = findDepartment(departmentCode);

  useEffect(() => {
    setDepartmentCode(findDepartment(routeDepartmentCode)?.code ?? "all");
  }, [routeDepartmentCode]);

  const items = useMemo(() => {
    const term = normalize(query.trim());
    return sortMunicipalities(municipalities).filter((municipality) => {
      const matchesDepartment = departmentCode === "all" || municipality.departmentCode === departmentCode;
      const matchesQuery = !term || normalize(`${municipality.code} ${municipality.name} ${municipality.displayName ?? ""} ${municipality.department}`).includes(term);
      return matchesDepartment && matchesQuery;
    });
  }, [departmentCode, query]);

  const selectDepartment = (nextDepartmentCode: string) => {
    setDepartmentCode(nextDepartmentCode);
    navigate(nextDepartmentCode === "all" ? "/municipios" : `/departamento/${nextDepartmentCode}`);
  };

  return <div className="catalog-page">
    <section className="catalog-hero catalog-hero--national">
      <div>
        <Link className="catalog-backlink" to="/">RADAR Guatemala</Link>
        <span className="catalog-eyebrow">Directorio territorial</span>
        <h1>Explorador municipal</h1>
        <p>Navegación oficial de los municipios y departamentos de Guatemala.</p>
      </div>
      <div className="catalog-hero-stats" aria-label="Directorio nacional">
        <span><strong>340</strong><small>municipios</small></span>
        <span><strong>22</strong><small>departamentos</small></span>
      </div>
    </section>

    <section className="catalog-directory" aria-labelledby="catalog-title">
      <div className="catalog-directory-heading">
        <div><span className="catalog-eyebrow">Directorio territorial</span><h2 id="catalog-title">{activeDepartment ? `Municipios de ${activeDepartment.name}` : "Todos los municipios"}</h2></div>
        <span className="catalog-result-count">{items.length} resultados</span>
      </div>
      <div className="catalog-controls catalog-controls--municipalities">
        <label className="catalog-search"><span>Buscar municipio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Nombre o código municipal" type="search" /></label>
      </div>
      <div className="catalog-department-index" aria-label="Explorar departamentos">
        <button className={departmentCode === "all" ? "active" : undefined} type="button" aria-pressed={departmentCode === "all"} data-catalog-department="all" onClick={() => selectDepartment("all")}><small>GT</small><span>Todos</span><b>340</b></button>
        {departments.map((department) => <button className={departmentCode === department.code ? "active" : undefined} type="button" aria-pressed={departmentCode === department.code} data-catalog-department={department.code} onClick={() => selectDepartment(department.code)} key={department.code}><small>{department.code}</small><span>{department.name}</span><b>{department.municipalityCount}</b></button>)}
      </div>
      {items.length > 0 ? <div className="catalog-municipality-grid">{items.map((municipality) => <CatalogMunicipalityCard municipality={municipality} key={municipality.code} />)}</div> : <p className="catalog-empty">No encontramos municipios con esos criterios.</p>}
    </section>
  </div>;
}

export function DepartmentPage() {
  const { departmentCode } = useParams();
  if (!findDepartment(departmentCode)) return <NotFoundPage />;
  return <MunicipalitiesPage />;
}

export function ComparePage() {
  const [firstCode, setFirstCode] = useState("0509");
  const [secondCode, setSecondCode] = useState("1901");
  const selected = [findMunicipality(firstCode), findMunicipality(secondCode)].filter(Boolean);
  return <div className="page page--compact">
    <span className="eyebrow">Área autenticada</span><h1>Comparar municipios</h1>
    <p className="lede">Seleccioná dos municipios. Los indicadores se solicitarán al Data Vault sólo para esta sesión.</p>
    <div className="compare-selectors">
      {[firstCode, secondCode].map((code, index) => <label key={index}><span>Municipio {index === 0 ? "A" : "B"}</span><select value={code} onChange={(event) => index === 0 ? setFirstCode(event.target.value) : setSecondCode(event.target.value)}>{municipalities.map((municipality) => <option key={municipality.code} value={municipality.code}>{municipality.code} · {municipality.name}, {municipality.department}</option>)}</select></label>)}
    </div>
    <div className="comparison-grid">{selected.map((municipality) => municipality && <article key={municipality.code}><div><small>{municipality.code} · {municipality.department}</small></div><h2>{municipality.name}</h2><Link to={`/municipio/${municipality.code}`}>Abrir dashboard →</Link></article>)}</div>
  </div>;
}

export function NotFoundPage() {
  return <div className="page page--compact"><span className="eyebrow">404</span><h1>Ruta no encontrada</h1><Link to="/">Volver al directorio nacional</Link></div>;
}
