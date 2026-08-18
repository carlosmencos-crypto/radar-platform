import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Nacional" },
  { to: "/departamento/05", label: "Departamentos" },
  { to: "/municipio/0509", label: "Municipios" },
  { to: "/comparar", label: "Comparar" },
];

export function Layout() {
  return (
    <div className="app-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="RADAR inicio">
          <span className="brand__name">RADAR</span>
          <span className="brand__descriptor">INTELIGENCIA ELECTORAL</span>
        </NavLink>
        <nav className="nav" aria-label="Navegación principal">
          {nav.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.to === "/"}>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <NavLink to="/admin" className="button button--ghost">Consola interna</NavLink>
      </header>
      <main><Outlet /></main>
    </div>
  );
}
