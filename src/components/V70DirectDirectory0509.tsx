import { useEffect, useMemo, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  loadAuthorizedVoterDirectory,
  type AuthorizedVoterDirectoryRow,
} from "../data/radarRuntime";
import { getInstalledRadarVoterCommunities } from "../data/radarRuntimeCache";
import { V70DirectShell0509 } from "./V70DirectShell0509";

const electorStatuses = [
  ["SIN_CONTACTO", "Sin contacto"],
  ["CONTACTADO", "Contactado"],
  ["INTERESADO", "Interesado"],
  ["NO_INTERESADO", "No interesado"],
  ["VOLUNTARIO", "Voluntario"],
  ["LIDER", "Líder"],
] as const;
const contactTypes = [
  "Candidato",
  "Coordinador",
  "Fiscal",
  "Líder",
  "Voluntario",
  "Contacto",
] as const;
const fmt = new Intl.NumberFormat("es-GT");

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function ElectorsDirectoryCanonical() {
  const { municipality_code } = useMunicipalityContext();
  const communityOptions =
    getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const initialCommunity =
    new URLSearchParams(window.location.search).get("community") ?? "";
  const [items, setItems] = useState<AuthorizedVoterDirectoryRow[]>([]);
  const [total, setTotal] = useState(36_878);
  const [query, setQuery] = useState("");
  const [dpi, setDpi] = useState("");
  const [community, setCommunity] = useState(initialCommunity);
  const [ageRange, setAgeRange] = useState("");
  const [status, setStatus] = useState("");
  const [affiliation, setAffiliation] = useState("");
  const [responsible, setResponsible] = useState("");
  const [role, setRole] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const age = useMemo(() => {
    if (!ageRange) return {};
    const [minimum, maximum] = ageRange.split("-");
    return {
      ageMin: Number(minimum),
      ageMax: maximum ? Number(maximum) : undefined,
    };
  }, [ageRange]);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void ensureRadarAccessToken()
        .then((token) =>
          loadAuthorizedVoterDirectory(
            municipality_code,
            {
              query,
              dpi,
              community,
              ...age,
              status,
              affiliation,
              role,
              offset: (page - 1) * pageSize,
              limit: pageSize,
            },
            token,
          ),
        )
        .then((rows) => {
          if (cancelled) return;
          setItems(rows);
          setTotal(rows[0]?.total_count ?? 0);
        })
        .catch((loadError: unknown) => {
          if (!cancelled)
            setError(
              loadError instanceof Error
                ? loadError.message
                : "No se pudo consultar el Directorio.",
            );
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    affiliation,
    age,
    community,
    dpi,
    municipality_code,
    page,
    pageSize,
    query,
    role,
    status,
  ]);

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const setFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const clear = () => {
    setQuery("");
    setDpi("");
    setCommunity("");
    setAgeRange("");
    setStatus("");
    setAffiliation("");
    setResponsible("");
    setRole("");
    setPage(1);
  };
  const statusLabel = (value: string) =>
    electorStatuses.find(([key]) => key === value)?.[1] ??
    value.replaceAll("_", " ");

  return (
    <>
      <section className="elector-kpis" aria-label="Resumen del Directorio">
        <span>
          <b>{fmt.format(total)}</b>
          <small>Registros</small>
        </span>
        <span>
          <b>0</b>
          <small>Contactos</small>
        </span>
        <span>
          <b>0</b>
          <small>Líderes</small>
        </span>
        <span>
          <b>{fmt.format(communityOptions.length || 148)}</b>
          <small>Comunidades</small>
        </span>
      </section>
      <section className="elector-filters">
        <label className="wide">
          <span>Nombre</span>
          <input
            value={query}
            onChange={(event) => setFilter(setQuery, event.target.value)}
            placeholder="Nombre o palabras aproximadas"
          />
        </label>
        <label>
          <span>DPI</span>
          <input
            inputMode="numeric"
            value={dpi}
            onChange={(event) =>
              setFilter(setDpi, event.target.value.replace(/\D/g, ""))
            }
            placeholder="DPI completo"
          />
        </label>
        <label>
          <span>Comunidad</span>
          <select
            value={community}
            onChange={(event) => setFilter(setCommunity, event.target.value)}
          >
            <option value="">Todas</option>
            {communityOptions.map((item) => (
              <option
                key={item.community_normalized}
                value={item.community_label}
              >
                {item.community_label} · {fmt.format(item.elector_count)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Edad estimada</span>
          <select
            value={ageRange}
            onChange={(event) => setFilter(setAgeRange, event.target.value)}
          >
            <option value="">Todas</option>
            <option value="18-29">18–29</option>
            <option value="30-44">30–44</option>
            <option value="45-59">45–59</option>
            <option value="60-">60 o más</option>
          </select>
        </label>
        <label>
          <span>Estado</span>
          <select
            value={status}
            onChange={(event) => setFilter(setStatus, event.target.value)}
          >
            <option value="">Todos</option>
            {electorStatuses.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Afiliado al partido</span>
          <select
            value={affiliation}
            onChange={(event) => setFilter(setAffiliation, event.target.value)}
          >
            <option value="">—</option>
            <option value="SI">Sí</option>
            <option value="NO">No</option>
          </select>
        </label>
        <label>
          <span>Responsable</span>
          <select
            value={responsible}
            onChange={(event) => setFilter(setResponsible, event.target.value)}
          >
            <option value="">Todos</option>
          </select>
        </label>
        <label>
          <span>Rol</span>
          <input
            value={role}
            onChange={(event) => setFilter(setRole, event.target.value)}
            placeholder="Ej. fiscal o liderazgo"
          />
        </label>
        <button type="button" onClick={clear}>
          Limpiar
        </button>
        <button
          type="button"
          className="primary"
          disabled
          title="La ficha manual se habilitará con el CRM completo"
        >
          + Agregar contacto
        </button>
      </section>
      {error ? <div className="agenda-message error">{error}</div> : null}
      <section className="elector-results">
        <header>
          <div>
            <small>RESULTADOS</small>
            <h2>{fmt.format(total)} personas</h2>
          </div>
          <label>
            Por página
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value));
                setPage(1);
              }}
            >
              <option value="25">25</option>
              <option value="50">50</option>
            </select>
          </label>
        </header>
        <div className="elector-table" role="table">
          <div className="elector-row head" role="row">
            <span>Persona</span>
            <span>Comunidad</span>
            <span>Edad estimada</span>
            <span>Estado</span>
            <span>Contacto</span>
            <span />
          </div>
          {loading ? (
            <div className="elector-loading">
              Cargando registros del municipio…
            </div>
          ) : items.length ? (
            items.map((item) => (
              <div className="elector-row" role="row" key={item.id}>
                <span className="elector-person">
                  <i aria-hidden="true">{initials(item.full_name)}</i>
                  <span>
                    <b>{item.full_name}</b>
                    <small>
                      {item.masked_identification ||
                        "Identificación no disponible"}
                    </small>
                  </span>
                </span>
                <span>{item.community || "Sin comunidad"}</span>
                <span>{item.estimated_age_2026 ?? "—"}</span>
                <span>
                  <i
                    className={`elector-status status-${item.contact_status.toLowerCase()}`}
                  >
                    {statusLabel(item.contact_status)}
                  </i>
                  {item.assigned_person_name ? (
                    <small>{item.assigned_person_name}</small>
                  ) : null}
                </span>
                <span>{item.phone_primary || "Sin teléfono"}</span>
                <span>→</span>
              </div>
            ))
          ) : (
            <div className="elector-loading">
              No hay coincidencias con estos filtros.
            </div>
          )}
        </div>
        <footer>
          <button
            disabled={page <= 1 || loading}
            onClick={() => setPage((value) => value - 1)}
          >
            ← Anterior
          </button>
          <span>
            Página <b>{fmt.format(page)}</b> de {fmt.format(pages)}
          </span>
          <button
            disabled={page >= pages || loading}
            onClick={() => setPage((value) => value + 1)}
          >
            Siguiente →
          </button>
        </footer>
      </section>
    </>
  );
}

function TeamDirectoryCanonical() {
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  return (
    <>
      <section className="crm-controlbar">
        <label className="crm-search">
          <span>⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar nombre, teléfono, comunidad o cargo"
          />
        </label>
        <label>
          <span>Tipo de contacto</span>
          <select
            value={contactFilter}
            onChange={(event) => setContactFilter(event.target.value)}
          >
            <option value="all">Todos</option>
            {contactTypes.map((item) => (
              <option key={item}>{item}</option>
            ))}
          </select>
        </label>
        <button className="crm-bulk-carnets" type="button" disabled>
          ↓ Carnets (0)
        </button>
        <div className="crm-view-switch" aria-label="Cambiar vista">
          <button
            className={view === "cards" ? "active" : ""}
            onClick={() => setView("cards")}
          >
            Tarjetas
          </button>
          <button
            className={view === "table" ? "active" : ""}
            onClick={() => setView("table")}
          >
            Lista
          </button>
        </div>
      </section>
      <section className="crm-directory crm-directory-v2">
        <header>
          <div>
            <small>CAMPAIGN VAULT · PRIVADO</small>
            <h2>0 contactos visibles</h2>
          </div>
        </header>
        <div className="agenda-empty">
          <b>El Directorio está listo para recibir tu base.</b>
          <span>Agrega el primer contacto del equipo.</span>
        </div>
      </section>
    </>
  );
}

function DirectoryContent() {
  const initialMode =
    new URLSearchParams(window.location.search).get("view") === "team"
      ? "team"
      : "electors";
  const [mode, setMode] = useState<"electors" | "team">(initialMode);
  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>CRM</p>
          <h1>Directorio</h1>
          <span>
            {mode === "electors"
              ? "Base electoral municipal y seguimiento"
              : "Base de datos / contactos por tipo"}
          </span>
        </div>
      </section>
      <nav
        className="directory-universe-tabs"
        aria-label="Universos del Directorio"
      >
        <button
          className={mode === "electors" ? "active" : ""}
          onClick={() => setMode("electors")}
        >
          <b>Posibles votantes</b>
          <span>Base precargada del municipio</span>
        </button>
        <button
          className={mode === "team" ? "active" : ""}
          onClick={() => setMode("team")}
        >
          <b>Equipo y responsables</b>
          <span>Operación interna de campaña</span>
        </button>
      </nav>
      {mode === "electors" ? (
        <ElectorsDirectoryCanonical />
      ) : (
        <TeamDirectoryCanonical />
      )}
    </>
  );
}

export function V70DirectDirectory0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer || municipalityCode !== "0509")
    return <Navigate to="/" replace />;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="directorio"
        eyebrow="RELACIONES"
        topbarTitle="San José / Puerto San José · Escuintla"
      >
        <DirectoryContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
