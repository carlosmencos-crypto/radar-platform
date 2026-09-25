import { NavLink, Outlet, useLocation } from "react-router-dom";

const nav = [
  { to: "/municipios", label: "Municipios" },
  { to: "/comparar", label: "Comparar" },
];

export function Layout() {
  const location = useLocation();
  const onAccessPage = location.pathname === "/acceso";

  return (
    <div className="app-shell public-shell">
      <header className="topbar">
        <NavLink to="/" className="brand" aria-label="RADAR inicio">
          <img src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Inteligencia Electoral" />
        </NavLink>
        {!onAccessPage && <nav className="nav" aria-label="Navegación principal">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive || (item.to === "/municipios" && location.pathname.startsWith("/departamento/"))
                  ? "active"
                  : undefined
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>}
        {!onAccessPage && <NavLink to="/admin" className="button button--ghost">Consola interna</NavLink>}
      </header>
      <main><Outlet /></main>
    </div>
  );
}
