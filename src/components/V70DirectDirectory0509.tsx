import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { resolveRadarConsumer } from "../data/radarConsumer";
import {
  addVoterInteraction,
  createManualVoter,
  loadAuthorizedVoterDetail,
  loadAuthorizedVoterDirectory,
  loadAuthorizedVoterSuggestions,
  loadCampaignContacts,
  revealAuthorizedVoterIdentification,
  saveAuthorizedVoterProfile,
  saveCampaignContact,
  type AuthorizedVoterDetail,
  type AuthorizedVoterDirectoryRow,
  type AuthorizedVoterSuggestion,
  type CampaignContactRecord,
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
const directoryCache = new Map<
  string,
  { items: AuthorizedVoterDirectoryRow[]; total: number }
>();

type VoterProfileForm = {
  contact_status: string;
  phone_primary: string;
  phone_secondary: string;
  exact_address: string;
  location_reference: string;
  confirmed_community: string;
  assigned_contact_id: string;
  assigned_person_name: string;
  campaign_role: string;
  party_affiliation: string;
  notes: string;
  next_action: string;
  next_action_at: string;
  latitude: string;
  longitude: string;
};

const emptyProfile: VoterProfileForm = {
  contact_status: "SIN_CONTACTO",
  phone_primary: "",
  phone_secondary: "",
  exact_address: "",
  location_reference: "",
  confirmed_community: "",
  assigned_contact_id: "",
  assigned_person_name: "",
  campaign_role: "",
  party_affiliation: "",
  notes: "",
  next_action: "",
  next_action_at: "",
  latitude: "",
  longitude: "",
};

function profileFromDetail(detail: AuthorizedVoterDetail): VoterProfileForm {
  const value = detail.profile;
  const text = (key: string) => (typeof value[key] === "string" ? String(value[key]) : "");
  return {
    ...emptyProfile,
    contact_status: text("contact_status") || "SIN_CONTACTO",
    phone_primary: text("phone_primary"),
    phone_secondary: text("phone_secondary"),
    exact_address: text("exact_address"),
    location_reference: text("location_reference"),
    confirmed_community: text("confirmed_community"),
    assigned_contact_id: text("assigned_contact_id"),
    assigned_person_name: text("assigned_person_name"),
    campaign_role: text("campaign_role"),
    party_affiliation: text("party_affiliation"),
    notes: text("notes"),
    next_action: text("next_action"),
    next_action_at: text("next_action_at").slice(0, 16),
    latitude: value.latitude == null ? "" : String(value.latitude),
    longitude: value.longitude == null ? "" : String(value.longitude),
  };
}

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
  const { campaign_id, municipality_code } = useMunicipalityContext();
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
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [contacts, setContacts] = useState<CampaignContactRecord[]>([]);
  const [suggestions, setSuggestions] = useState<AuthorizedVoterSuggestion[]>([]);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [detail, setDetail] = useState<AuthorizedVoterDetail | null>(null);
  const [profile, setProfile] = useState<VoterProfileForm>(emptyProfile);
  const [dpiRevealed, setDpiRevealed] = useState("");
  const [saving, setSaving] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [manual, setManual] = useState({
    full_name: "",
    identification: "",
    community: "",
    estimated_age_2026: "",
  });
  const [interaction, setInteraction] = useState({
    interaction_type: "LLAMADA",
    interaction_at: "",
    responsible_contact_id: "",
    notes: "",
    commitment: "",
  });

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
    if (!campaign_id) return;
    void ensureRadarAccessToken()
      .then((token) => loadCampaignContacts(campaign_id, token))
      .then((rows) => {
        if (!cancelled) setContacts(rows ?? []);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [campaign_id, revision]);

  useEffect(() => {
    let cancelled = false;
    if (query.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void ensureRadarAccessToken()
        .then((token) =>
          loadAuthorizedVoterSuggestions(municipality_code, query, token),
        )
        .then((rows) => {
          if (!cancelled) setSuggestions(rows);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        });
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [municipality_code, query]);

  useEffect(() => {
    let cancelled = false;
    const cacheKey = JSON.stringify({
      municipality_code,
      query,
      dpi,
      community,
      age,
      status,
      affiliation,
      role,
      page,
      pageSize,
    });
    const cached = directoryCache.get(cacheKey);
    if (cached) {
      setItems(cached.items);
      setTotal(cached.total);
      setLoading(false);
      return;
    }
    const hasFilters = Boolean(
      query || dpi || community || ageRange || status || affiliation || role,
    );
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
          const nextTotal = rows[0]?.total_count ?? 0;
          setTotal(nextTotal);
          if (directoryCache.size >= 50) directoryCache.clear();
          directoryCache.set(cacheKey, { items: rows, total: nextTotal });
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
    }, hasFilters ? 250 : 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    affiliation,
    age,
    ageRange,
    community,
    dpi,
    municipality_code,
    page,
    pageSize,
    query,
    role,
    status,
    revision,
  ]);

  async function openDetail(voterId: number) {
    setMessage("");
    setDpiRevealed("");
    setSaving(true);
    try {
      const token = await ensureRadarAccessToken();
      const loaded = await loadAuthorizedVoterDetail(
        municipality_code,
        voterId,
        token,
      );
      if (!loaded) throw new Error("No se pudo abrir la ficha.");
      setDetail(loaded);
      setProfile(profileFromDetail(loaded));
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "No se pudo abrir la ficha.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!campaign_id || !detail) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      await saveAuthorizedVoterProfile(
        campaign_id,
        detail.elector.id,
        {
          ...profile,
          assigned_person_name:
            contacts.find((item) => item.id === profile.assigned_contact_id)
              ?.full_name ?? profile.assigned_person_name,
          next_action_at: profile.next_action_at
            ? new Date(profile.next_action_at).toISOString()
            : null,
          latitude: profile.latitude || null,
          longitude: profile.longitude || null,
        },
        token,
      );
      directoryCache.clear();
      setMessage("Ficha privada actualizada.");
      setRevision((value) => value + 1);
      await openDetail(detail.elector.id);
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la ficha privada.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function createManual(event: FormEvent) {
    event.preventDefault();
    if (!campaign_id) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const voterId = await createManualVoter(
        campaign_id,
        {
          ...manual,
          estimated_age_2026: manual.estimated_age_2026 || null,
        },
        token,
      );
      directoryCache.clear();
      setManualOpen(false);
      setManual({
        full_name: "",
        identification: "",
        community: "",
        estimated_age_2026: "",
      });
      setRevision((value) => value + 1);
      await openDetail(voterId);
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo agregar el contacto.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function revealDpi() {
    if (!detail) return;
    try {
      const token = await ensureRadarAccessToken();
      setDpiRevealed(
        (await revealAuthorizedVoterIdentification(
          municipality_code,
          detail.elector.id,
          token,
        )) ?? "No disponible",
      );
    } catch {
      setMessage("No se pudo revelar el DPI con esta sesión.");
    }
  }

  async function addInteraction(event: FormEvent) {
    event.preventDefault();
    if (!campaign_id || !detail) return;
    setSaving(true);
    try {
      const token = await ensureRadarAccessToken();
      await addVoterInteraction(
        campaign_id,
        detail.elector.id,
        {
          ...interaction,
          interaction_at: interaction.interaction_at
            ? new Date(interaction.interaction_at).toISOString()
            : null,
          responsible_contact_id:
            interaction.responsible_contact_id || null,
        },
        token,
      );
      setInteraction({
        interaction_type: "LLAMADA",
        interaction_at: "",
        responsible_contact_id: "",
        notes: "",
        commitment: "",
      });
      setMessage("Interacción agregada al historial.");
      await openDetail(detail.elector.id);
    } catch (saveError) {
      setMessage(
        saveError instanceof Error
          ? saveError.message
          : "No se pudo guardar la interacción.",
      );
    } finally {
      setSaving(false);
    }
  }

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
        <div className="elector-name-filter wide">
          <label>
            <span>Nombre</span>
            <input
              value={query}
              onFocus={() => setSuggestionsOpen(true)}
              onChange={(event) => {
                setFilter(setQuery, event.target.value);
                setSuggestionsOpen(true);
              }}
              placeholder="Nombre o palabras aproximadas"
              autoComplete="off"
            />
          </label>
          {suggestionsOpen && query.trim().length >= 2 && suggestions.length ? (
            <div className="elector-name-suggestions">
              {suggestions.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setQuery(item.full_name);
                    setPage(1);
                    setSuggestionsOpen(false);
                  }}
                >
                  <b>{item.full_name}</b>
                  <span>{item.community || "Sin comunidad"}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
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
            {contacts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
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
          onClick={() => {
            setMessage("");
            setManualOpen(true);
          }}
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
              <button
                type="button"
                className="elector-row"
                role="row"
                key={item.id}
                onClick={() => void openDetail(item.id)}
              >
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
              </button>
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
      {manualOpen ? (
        <div className="agenda-modal" role="dialog" aria-modal="true">
          <form className="crm-person-form elector-manual-form" onSubmit={createManual}>
            <header>
              <div>
                <small>POSIBLES VOTANTES</small>
                <h2>Agregar contacto</h2>
                <p>Se incorporará al Directorio y tendrá una ficha privada completa.</p>
              </div>
              <button type="button" onClick={() => setManualOpen(false)}>×</button>
            </header>
            <div className="agenda-form-grid">
              <label className="wide"><span>Nombre completo *</span><input autoFocus required value={manual.full_name} onChange={(event) => setManual({ ...manual, full_name: event.target.value })} /></label>
              <label><span>DPI</span><input inputMode="numeric" maxLength={13} value={manual.identification} onChange={(event) => setManual({ ...manual, identification: event.target.value.replace(/\D/g, "") })} placeholder="13 dígitos" /></label>
              <label><span>Comunidad</span><input list="manual-community-options" value={manual.community} onChange={(event) => setManual({ ...manual, community: event.target.value })} /><datalist id="manual-community-options">{communityOptions.map((item) => <option key={item.community_normalized} value={item.community_label} />)}</datalist></label>
              <label><span>Edad estimada</span><input type="number" min="18" max="120" value={manual.estimated_age_2026} onChange={(event) => setManual({ ...manual, estimated_age_2026: event.target.value })} /></label>
            </div>
            {message ? <p className="form-error">{message}</p> : null}
            <footer><span /><button type="button" onClick={() => setManualOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Agregando…" : "Agregar y completar ficha"}</button></footer>
          </form>
        </div>
      ) : null}
      {detail ? (
        <div className="agenda-modal elector-modal" role="dialog" aria-modal="true">
          <section className="elector-sheet">
            <header>
              <div className="elector-sheet-person"><i aria-hidden="true">{initials(detail.elector.full_name)}</i><span><small>FICHA DE CONTACTO · {detail.elector.id}</small><h2>{detail.elector.full_name}</h2><p>{detail.elector.community || "Sin comunidad"} · {detail.elector.municipality_name}</p></span></div>
              <button type="button" onClick={() => setDetail(null)}>×</button>
            </header>
            <div className="elector-base-data">
              <span><small>DPI</small><b>{dpiRevealed || detail.elector.masked_identification || "No disponible"}</b>{detail.elector.masked_identification ? <button type="button" onClick={() => void revealDpi()}>{dpiRevealed ? "Visible hasta cerrar" : "Revelar"}</button> : null}</span>
              <span><small>Edad estimada</small><b>{detail.elector.estimated_age_2026 ?? "—"}</b></span>
            </div>
            <div className="elector-sheet-links"><Link to={`/municipio/${municipality_code}/mapa?community=${encodeURIComponent(detail.elector.community || "")}`}>Ubicar comunidad en el mapa</Link><Link to={`/municipio/${municipality_code}/agenda?new=1&community=${encodeURIComponent(detail.elector.community || "")}&elector=${detail.elector.id}&electorName=${encodeURIComponent(detail.elector.full_name)}`}>Crear actividad en Agenda</Link></div>
            <form className="elector-private-form" onSubmit={saveProfile}>
              <header><div><small>CAMPAIGN VAULT · PRIVADO</small><h3>Contacto</h3></div></header>
              <div className="agenda-form-grid">
                <label><span>Estado</span><select value={profile.contact_status} onChange={(event) => setProfile({ ...profile, contact_status: event.target.value })}>{electorStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Afiliado al partido</span><select value={profile.party_affiliation} onChange={(event) => setProfile({ ...profile, party_affiliation: event.target.value })}><option value="">—</option><option value="SI">Sí</option><option value="NO">No</option></select></label>
                <label><span>Teléfono principal</span><input value={profile.phone_primary} onChange={(event) => setProfile({ ...profile, phone_primary: event.target.value })} /></label>
                <label><span>Teléfono secundario</span><input value={profile.phone_secondary} onChange={(event) => setProfile({ ...profile, phone_secondary: event.target.value })} /></label>
                <label className="wide"><span>Dirección exacta</span><input value={profile.exact_address} onChange={(event) => setProfile({ ...profile, exact_address: event.target.value })} /></label>
                <label><span>Comunidad confirmada</span><input value={profile.confirmed_community} onChange={(event) => setProfile({ ...profile, confirmed_community: event.target.value })} /></label>
                <label><span>Rol en campaña</span><input value={profile.campaign_role} onChange={(event) => setProfile({ ...profile, campaign_role: event.target.value })} /></label>
                <label><span>Responsable</span><select value={profile.assigned_contact_id} onChange={(event) => setProfile({ ...profile, assigned_contact_id: event.target.value })}><option value="">Sin asignar</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
                <label><span>Próxima acción</span><input value={profile.next_action} onChange={(event) => setProfile({ ...profile, next_action: event.target.value })} /></label>
                <label><span>Fecha próxima acción</span><input type="datetime-local" value={profile.next_action_at} onChange={(event) => setProfile({ ...profile, next_action_at: event.target.value })} /></label>
                <label className="wide"><span>Notas privadas</span><textarea rows={3} value={profile.notes} onChange={(event) => setProfile({ ...profile, notes: event.target.value })} /></label>
              </div>
              {message ? <p className="form-error">{message}</p> : null}
              <footer><span /><button type="button" onClick={() => setDetail(null)}>Cerrar</button><button disabled={saving}>{saving ? "Guardando…" : "Guardar ficha"}</button></footer>
            </form>
            <form className="elector-interaction-form" onSubmit={addInteraction}>
              <header><small>HISTORIAL</small><h3>Agregar interacción</h3></header>
              <div className="agenda-form-grid">
                <label><span>Tipo</span><select value={interaction.interaction_type} onChange={(event) => setInteraction({ ...interaction, interaction_type: event.target.value })}>{["LLAMADA", "VISITA", "REUNIÓN", "MENSAJE", "OTRA"].map((item) => <option key={item}>{item}</option>)}</select></label>
                <label><span>Fecha</span><input type="datetime-local" value={interaction.interaction_at} onChange={(event) => setInteraction({ ...interaction, interaction_at: event.target.value })} /></label>
                <label className="wide"><span>Notas</span><textarea required rows={2} value={interaction.notes} onChange={(event) => setInteraction({ ...interaction, notes: event.target.value })} /></label>
                <label className="wide"><span>Compromiso</span><input value={interaction.commitment} onChange={(event) => setInteraction({ ...interaction, commitment: event.target.value })} /></label>
              </div>
              <footer><span /><button disabled={saving}>Agregar al historial</button></footer>
              <div className="elector-interaction-list">{detail.interactions.length ? detail.interactions.map((item) => <article key={String(item.id)}><b>{String(item.interaction_type || "INTERACCIÓN")}</b><span>{String(item.notes || "Sin notas")}</span></article>) : <p>Sin interacciones registradas.</p>}</div>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

function TeamDirectoryCanonical() {
  const { campaign_id } = useMunicipalityContext();
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [contacts, setContacts] = useState<CampaignContactRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    community: "",
    role: "",
    contact_type: "Contacto",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    if (!campaign_id) return;
    void ensureRadarAccessToken()
      .then((token) => loadCampaignContacts(campaign_id, token))
      .then((rows) => {
        if (!cancelled) setContacts(rows ?? []);
      })
      .catch((loadError: unknown) => {
        if (!cancelled)
          setMessage(
            loadError instanceof Error
              ? loadError.message
              : "No se pudo cargar el equipo.",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [campaign_id]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return contacts.filter((contact) => {
      const matchesType =
        contactFilter === "all" || contact.contact_type === contactFilter;
      const matchesTerm =
        !term ||
        `${contact.full_name} ${contact.phone ?? ""} ${contact.community ?? ""} ${contact.role ?? ""}`
          .toLocaleLowerCase("es")
          .includes(term);
      return matchesType && matchesTerm;
    });
  }, [contactFilter, contacts, query]);

  async function createContact(event: FormEvent) {
    event.preventDefault();
    if (!campaign_id) return;
    setSaving(true);
    setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignContact(campaign_id, form, token);
      setContacts((current) => [...current, saved].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
      setForm({ full_name: "", phone: "", email: "", community: "", role: "", contact_type: "Contacto", notes: "" });
      setOpen(false);
      setMessage("Contacto agregado al Campaign Vault.");
    } catch (saveError) {
      setMessage(saveError instanceof Error ? saveError.message : "No se pudo guardar el contacto.");
    } finally {
      setSaving(false);
    }
  }
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
          ↓ Carnets ({visible.length})
        </button>
        <button className="primary" type="button" onClick={() => setOpen(true)}>+ Agregar contacto</button>
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
            <h2>{fmt.format(visible.length)} contactos visibles</h2>
          </div>
        </header>
        {message ? <p className="agenda-message" role="status">{message}</p> : null}
        {visible.length ? (
          <div className={view === "cards" ? "crm-card-grid" : "crm-table-list"}>
            {visible.map((contact) => (
              <article className="crm-contact-card" key={contact.id}>
                <header><i aria-hidden="true">{initials(contact.full_name)}</i><div><small className="crm-status">{contact.contact_type}</small><h3>{contact.full_name}</h3><p>{contact.role || "Sin cargo"}</p></div></header>
                <div className="crm-contact-meta"><span><small>Comunidad</small><b>{contact.community || "Sin comunidad"}</b></span><span><small>Teléfono</small><b>{contact.phone || "Sin teléfono"}</b></span></div>
              </article>
            ))}
          </div>
        ) : (
          <div className="agenda-empty"><b>El Directorio está listo para recibir tu base.</b><span>Agrega el primer contacto del equipo.</span><button type="button" onClick={() => setOpen(true)}>+ Agregar contacto</button></div>
        )}
      </section>
      {open ? (
        <div className="agenda-modal" role="dialog" aria-modal="true">
          <form className="crm-person-form" onSubmit={createContact}>
            <header><div><small>CAMPAIGN VAULT · PRIVADO</small><h2>Agregar contacto al equipo</h2></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
            <div className="agenda-form-grid">
              <label className="wide"><span>Nombre completo *</span><input autoFocus required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} /></label>
              <label><span>Tipo de contacto</span><select value={form.contact_type} onChange={(event) => setForm({ ...form, contact_type: event.target.value })}>{contactTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label><span>Cargo o responsabilidad</span><input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} /></label>
              <label><span>Teléfono</span><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} /></label>
              <label><span>Correo</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <label className="wide"><span>Comunidad</span><input value={form.community} onChange={(event) => setForm({ ...form, community: event.target.value })} /></label>
              <label className="wide"><span>Notas</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
            {message ? <p className="form-error">{message}</p> : null}
            <footer><span /><button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : "Agregar contacto"}</button></footer>
          </form>
        </div>
      ) : null}
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
