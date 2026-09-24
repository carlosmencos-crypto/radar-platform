import { Link, Navigate, useParams } from "react-router-dom";
import { municipalities } from "../data/municipalities";
import { resolveRadarConsumer } from "../data/radarConsumer";

export function DemoMunicipalityEntry() {
  const { demoCode } = useParams();
  const code = /^(\d{4})d$/.exec(demoCode ?? "")?.[1];
  if (!code || !resolveRadarConsumer(code)) return <Navigate to="/acceso-restringido" replace />;
  return <Navigate to={`/municipio/${code}?demo=1`} replace />;
}

export function DemoMunicipalitiesPage() {
  return <div className="page"><span className="eyebrow">DEMO</span><h1>Demostraciones municipales</h1><p>340 entradas. Cada una requiere un espacio demo autorizado; no abre espacios de clientes reales.</p><ul>{municipalities.map(m => <li key={m.code}><Link to={`/${m.code}d`}>{m.code} · {m.name} · {m.department}</Link></li>)}</ul></div>;
}
