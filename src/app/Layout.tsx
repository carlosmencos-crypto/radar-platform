import { NavLink, Outlet } from "react-router-dom";

const nav = [
  { to: "/", label: "Nacional" },
  { to: "/#departamentos", label: "Departamentos" },
  { to: "/municipios", label: "Municipios" },
  { to: "/comparar", label: "Comparar" },
];

export function Layout() {
  return (
    <div className="app-shell public-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="RADAR inicio">
          <img src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Inteligencia Electoral" />
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
