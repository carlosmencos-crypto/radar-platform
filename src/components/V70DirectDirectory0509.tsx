import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
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
  loadCampaignBundle,
  loadCampaignContacts,
  loadCampaignRecords,
  revealAuthorizedVoterIdentification,
  saveAuthorizedVoterProfile,
  saveCampaignContact,
  type AuthorizedVoterDetail,
  type AuthorizedVoterDirectoryRow,
  type CampaignIdentityRecord,
  type CampaignModuleRecord,
  type CampaignContactRecord,
} from "../data/radarRuntime";
import { zipSync } from "fflate";
import {
  getInstalledRadarRuntime,
  getInstalledRadarVoterCommunities,
} from "../data/radarRuntimeCache";
import { createRadarXlsx } from "../data/xlsxExport";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { V70PhotoEditor } from "./V70PhotoEditor";
import {
  announceV70CampaignUpdate,
  candidatePositions,
} from "./useV70CampaignBrand";

const electorStatuses = [
  ["SIN_CONTACTO", "Sin contacto"],
  ["CONTACTADO", "Contactado"],
  ["INTERESADO", "Interesado"],
  ["NO_INTERESADO", "No interesado"],
  ["VOLUNTARIO", "Voluntario"],
  ["LIDER", "Líder"],
] as const;
const contactTypes = [
  "Equipo de campaña",
  "Liderazgo comunitario",
  "Proveedor",
  "Medio de comunicación",
  "Institución",
  "Candidato",
  "Fiscal",
] as const;
const contactTypePrefixes: Record<string, string> = {
  "Equipo de campaña": "EC",
  "Liderazgo comunitario": "LC",
  Proveedor: "PR",
  "Medio de comunicación": "MC",
  Institución: "IN",
  Candidato: "CA",
  Fiscal: "FI",
};
const fmt = new Intl.NumberFormat("es-GT");
const DIRECTORY_ADD_EVENT = "radar:v70-directory-add";
const DIRECTORY_EXPORT_EVENT = "radar:v70-directory-export";
const directoryCache = new Map<
  string,
  { items: AuthorizedVoterDirectoryRow[]; total: number }
>();

type VoterProfileForm = {
  photo_url: string;
  dpi_front_url: string;
  dpi_back_url: string;
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
  photo_url: "",
  dpi_front_url: "",
  dpi_back_url: "",
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
    photo_url: text("photo_url"),
    dpi_front_url: text("dpi_front_url") || text("dpi_front_data_url"),
    dpi_back_url: text("dpi_back_url") || text("dpi_back_data_url"),
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

function readPrivateImage(file: File) {
  return new Promise<string>((resolve, reject) => {
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error("La imagen supera el máximo de 6 MB."));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function ElectorsDirectoryCanonical() {
  const { municipality_code, municipality_name } = useMunicipalityContext();
  const readiness = getInstalledRadarRuntime(municipality_code)?.client_readiness;
  const directoryReady = readiness?.status === "CLIENT_READY" && readiness.possible_voters_loaded;
  if (!directoryReady) return <section className="canonical-protected-page directory-readiness-page" role="status">
    <small>{readiness?.status ?? "BLOCKED"}</small>
    <h2>Módulo listo para una campaña autorizada</h2>
    <p>La Inteligencia Municipal pública de {municipality_name} está disponible. El directorio privado de posibles votantes permanece cerrado porque todavía no existe una fuente autorizada con nombres y DPI para esta campaña.</p>
    <div className="directory-readiness-requirements">
      <article className="ready"><small>Inteligencia pública</small><b>Disponible</b><span>El perfil municipal nacional continúa accesible.</span></article>
      <article><small>Campaña autorizada</small><b>{readiness?.campaign_connected ? "Conectada" : "Requisito pendiente"}</b><span>Debe asociarse una campaña válida al municipio.</span></article>
      <article><small>Directorio privado</small><b>{readiness?.possible_voters_loaded ? "Cargado" : "Requisito pendiente"}</b><span>Se requiere una carga autorizada, aislada y verificable.</span></article>
    </div>
  </section>;
  return <ElectorsDirectoryReady />;
}

function ElectorsDirectoryReady() {
  const { campaign_id, municipality_code, municipality_name } = useMunicipalityContext();
  const municipalRuntime = getInstalledRadarRuntime(municipality_code);
  const communityOptions =
    getInstalledRadarVoterCommunities(municipality_code) ?? [];
  const initialCommunity =
    new URLSearchParams(window.location.search).get("community") ?? "";
  const [items, setItems] = useState<AuthorizedVoterDirectoryRow[]>([]);
  const [total, setTotal] = useState(
    municipalRuntime?.voter_roll.aggregates.find(
      (item) => item.universe === "PADRON_DETALLADO_2023",
    )?.elector_count ?? 0,
  );
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
    const cacheKey = JSON.stringify({
      municipality_code,
      query,
      dpi,
      community,
      age,
      status,
      affiliation,
      responsible,
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
      query || dpi || community || ageRange || status || affiliation || responsible || role,
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
              responsible,
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
    responsible,
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
              onChange={(event) => {
                setFilter(setQuery, event.target.value);
              }}
              placeholder="Nombre o palabras aproximadas"
              autoComplete="off"
            />
          </label>
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
            {contacts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.full_name}
              </option>
            ))}
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
              <div className="elector-sheet-person">{profile.photo_url ? <img src={profile.photo_url} alt={`Fotografía de ${detail.elector.full_name}`} /> : <i aria-hidden="true">{initials(detail.elector.full_name)}</i>}<span><small>FICHA DE CONTACTO · {municipality_code}-{String(detail.elector.id).padStart(6, "0")}</small><h2>{detail.elector.full_name}</h2><p>{detail.elector.community || "Sin comunidad"} · {municipality_name}</p></span></div>
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
                <div className="wide photo-editor-field"><span>Fotografía</span><V70PhotoEditor currentSrc={profile.photo_url} onChange={(photo_url) => setProfile({ ...profile, photo_url })} onError={setMessage} /></div>
                <label><span>Estado de contacto</span><select value={profile.contact_status} onChange={(event) => setProfile({ ...profile, contact_status: event.target.value })}>{electorStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Afiliado al partido</span><select value={profile.party_affiliation} onChange={(event) => setProfile({ ...profile, party_affiliation: event.target.value })}><option value="">—</option><option value="SI">Sí</option><option value="NO">No</option></select></label>
                <label><span>Responsable</span><select value={profile.assigned_contact_id} onChange={(event) => setProfile({ ...profile, assigned_contact_id: event.target.value })}><option value="">Sin asignar</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select></label>
                <label><span>Teléfono principal</span><input value={profile.phone_primary} onChange={(event) => setProfile({ ...profile, phone_primary: event.target.value })} /></label>
                <label><span>Teléfono secundario</span><input value={profile.phone_secondary} onChange={(event) => setProfile({ ...profile, phone_secondary: event.target.value })} /></label>
                <label className="wide"><span>Dirección exacta</span><input value={profile.exact_address} onChange={(event) => setProfile({ ...profile, exact_address: event.target.value })} placeholder="Dato privado agregado por la campaña" /></label>
                <label><span>Referencia de ubicación</span><input value={profile.location_reference} onChange={(event) => setProfile({ ...profile, location_reference: event.target.value })} /></label>
                <label><span>Comunidad actual confirmada</span><input value={profile.confirmed_community} onChange={(event) => setProfile({ ...profile, confirmed_community: event.target.value })} /></label>
                <label><span>Rol o responsabilidad</span><input value={profile.campaign_role} onChange={(event) => setProfile({ ...profile, campaign_role: event.target.value })} /></label>
                <label><span>Próxima acción</span><input value={profile.next_action} onChange={(event) => setProfile({ ...profile, next_action: event.target.value })} /></label>
                <label><span>Fecha de próxima acción</span><input type="date" value={profile.next_action_at.slice(0, 10)} onChange={(event) => setProfile({ ...profile, next_action_at: event.target.value })} /></label>
                <fieldset className="wide elector-document-grid"><legend>DPI (opcional)</legend><label><span>Frontal</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const next = event.target.files?.[0]; if (!next) return; void readPrivateImage(next).then((dpi_front_url) => setProfile((current) => ({ ...current, dpi_front_url }))).catch((fileError: Error) => setMessage(fileError.message)); }} /><small>{profile.dpi_front_url ? "Imagen lista o guardada" : "JPG, PNG o WebP · máximo 6 MB"}</small>{profile.dpi_front_url ? <a href={profile.dpi_front_url} target="_blank" rel="noreferrer">Ver imagen</a> : null}</label><label><span>Trasero</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => { const next = event.target.files?.[0]; if (!next) return; void readPrivateImage(next).then((dpi_back_url) => setProfile((current) => ({ ...current, dpi_back_url }))).catch((fileError: Error) => setMessage(fileError.message)); }} /><small>{profile.dpi_back_url ? "Imagen lista o guardada" : "JPG, PNG o WebP · máximo 6 MB"}</small>{profile.dpi_back_url ? <a href={profile.dpi_back_url} target="_blank" rel="noreferrer">Ver imagen</a> : null}</label></fieldset>
                <label className="wide"><span>Observaciones</span><textarea rows={3} value={profile.notes} onChange={(event) => setProfile({ ...profile, notes: event.target.value })} /></label>
              </div>
              {message ? <p className="form-error">{message}</p> : null}
              <footer><button disabled={saving}>{saving ? "Guardando…" : "Guardar ficha privada"}</button></footer>
            </form>
            <section className="elector-history">
              <header><div><small>HISTORIAL</small><h3>Contactos, visitas y compromisos</h3></div></header>
              <form onSubmit={addInteraction}>
                <select aria-label="Tipo de interacción" value={interaction.interaction_type} onChange={(event) => setInteraction({ ...interaction, interaction_type: event.target.value })}>{["LLAMADA", "VISITA", "REUNION", "MENSAJE", "COMPROMISO", "OTRA"].map((item) => <option key={item}>{item}</option>)}</select>
                <input required aria-label="Fecha de interacción" type="datetime-local" value={interaction.interaction_at} onChange={(event) => setInteraction({ ...interaction, interaction_at: event.target.value })} />
                <select aria-label="Responsable" value={interaction.responsible_contact_id} onChange={(event) => setInteraction({ ...interaction, responsible_contact_id: event.target.value })}><option value="">Responsable…</option>{contacts.map((item) => <option key={item.id} value={item.id}>{item.full_name}</option>)}</select>
                <input aria-label="Nota" value={interaction.notes} onChange={(event) => setInteraction({ ...interaction, notes: event.target.value })} placeholder="Nota breve" />
                <button disabled={saving}>Agregar</button>
              </form>
              <div className="elector-interaction-list">{detail.interactions.length ? detail.interactions.map((item) => <article key={String(item.id)}><b>{String(item.interaction_type || "INTERACCIÓN")}</b><span>{String(item.notes || "Sin notas")}</span><small>{item.interaction_at ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(item.interaction_at))) : ""}</small></article>) : <p>Aún no hay interacciones registradas.</p>}</div>
            </section>
          </section>
        </div>
      ) : null}
    </>
  );
}

function LegacyTeamDirectoryCanonical() {
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
void LegacyTeamDirectoryCanonical;

type ContactDraft = {
  first_names: string;
  last_names: string;
  phone: string;
  phone_secondary: string;
  email: string;
  community: string;
  role: string;
  contact_type: string;
  candidate_position: string;
  notes: string;
  photo_url: string;
};
const emptyContact: ContactDraft = {
  first_names: "", last_names: "", phone: "", phone_secondary: "", email: "", community: "", role: "",
  contact_type: "", candidate_position: "", notes: "", photo_url: "",
};

function splitContactName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { first_names: parts[0] || "", last_names: "" };
  if (parts.length === 2) return { first_names: parts[0], last_names: parts[1] };
  const surnameCount = parts.length >= 4 ? 2 : 1;
  return { first_names: parts.slice(0, -surnameCount).join(" "), last_names: parts.slice(-surnameCount).join(" ") };
}

function contactDisplayRole(person: CampaignContactRecord) {
  return person.contact_type === "Candidato" ? `Candidato a ${person.candidate_position || "cargo por definir"}.` : person.contact_type || "Contacto de campaña";
}

function imageFromUrl(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("No se pudo cargar la imagen."));
    image.src = url;
  });
}
function roundedRectPath(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  context.beginPath();
  context.moveTo(x + radius, y);
  context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius);
  context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius);
  context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y);
  context.closePath();
}
function drawCoverImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
  const sourceWidth = width / scale; const sourceHeight = height / scale;
  context.drawImage(image, (image.naturalWidth - sourceWidth) / 2, (image.naturalHeight - sourceHeight) / 2, sourceWidth, sourceHeight, x, y, width, height);
}
function drawContainImage(context: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number) {
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale; const drawHeight = image.naturalHeight * scale;
  context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}
function drawFittedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, startSize = 62, minSize = 36) {
  let size = startSize; context.font = `850 ${size}px Inter, Arial, sans-serif`;
  while (size > minSize && context.measureText(text).width > maxWidth) { size -= 2; context.font = `850 ${size}px Inter, Arial, sans-serif`; }
  context.fillText(text, x, y);
}
function drawWrappedText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/).filter(Boolean); const lines: string[] = []; let current = "";
  words.forEach((word) => { const next = current ? `${current} ${word}` : word; if (!current || context.measureText(next).width <= maxWidth) current = next; else { lines.push(current); current = word; } });
  if (current) lines.push(current); lines.slice(0, 2).forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}
function fileSlug(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "contacto";
}
function normalizedContactType(value: string) {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").trim();
  const aliases: Record<string, string> = {
    candidato: "Candidato",
    fiscal: "Fiscal",
    coordinador: "Equipo de campaña",
    contacto: "Equipo de campaña",
    voluntario: "Equipo de campaña",
    lider: "Liderazgo comunitario",
    "liderazgo comunitario": "Liderazgo comunitario",
    proveedor: "Proveedor",
    institucion: "Institución",
    "medio de comunicacion": "Medio de comunicación",
    "equipo de campana": "Equipo de campaña",
  };
  return aliases[normalized] || value;
}
function nextContactCode(typeValue: string, contacts: CampaignContactRecord[]) {
  const canonicalType = normalizedContactType(typeValue);
  const prefix = contactTypePrefixes[canonicalType] || "EC";
  const maximum = contacts.reduce((max, contact) => {
    const match = contact.file_code?.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return `${prefix}${String(maximum + 1).padStart(2, "0")}`;
}
function blobDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = name; anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1200);
}
async function carnetPng(
  person: CampaignContactRecord,
  identity: CampaignIdentityRecord,
  assignment?: CampaignModuleRecord,
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo preparar el carnet.");
  const [radarLogo, partyLogo, portrait] = await Promise.all([
    imageFromUrl(`${import.meta.env.BASE_URL}brand/radar-electoral-logo-horizontal-oscuro-transparente.svg`).catch(() => null),
    identity.party_logo_data_url ? imageFromUrl(identity.party_logo_data_url).catch(() => null) : Promise.resolve(null),
    person.photo_url ? imageFromUrl(person.photo_url).catch(() => null) : Promise.resolve(null),
  ]);
  ctx.fillStyle = "#F7F5EF"; ctx.fillRect(0, 0, 1080, 1350); ctx.fillStyle = "#2F343A"; ctx.fillRect(0, 0, 20, 1350);
  const photoX = 64; const photoY = 64; const photoWidth = 952; const photoHeight = 700;
  ctx.save(); roundedRectPath(ctx, photoX, photoY, photoWidth, photoHeight, 52); ctx.clip();
  if (portrait) drawCoverImage(ctx, portrait, photoX, photoY, photoWidth, photoHeight);
  else { const gradient = ctx.createLinearGradient(photoX, photoY, photoX + photoWidth, photoY + photoHeight); gradient.addColorStop(0, "#08576E"); gradient.addColorStop(1, "#2F343A"); ctx.fillStyle = gradient; ctx.fillRect(photoX, photoY, photoWidth, photoHeight); ctx.fillStyle = "#FFFFFF"; ctx.font = "800 180px Inter, Arial, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(initials(person.full_name), photoX + photoWidth / 2, photoY + photoHeight / 2); }
  ctx.restore(); ctx.textAlign = "left"; ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(47,52,58,.82)"; roundedRectPath(ctx, 100, 100, 330, 58, 29); ctx.fill(); ctx.fillStyle = "#FFFFFF"; ctx.font = "800 22px Inter, Arial, sans-serif"; ctx.fillText("CARNET DE CAMPAÑA", 134, 138);
  const partyCenterX = 890; const partyCenterY = photoY + photoHeight; ctx.fillStyle = "#FFFFFF"; ctx.beginPath(); ctx.arc(partyCenterX, partyCenterY, 112, 0, Math.PI * 2); ctx.fill(); ctx.lineWidth = 8; ctx.strokeStyle = "#F7F5EF"; ctx.stroke();
  if (partyLogo) { const wide = partyLogo.naturalWidth / Math.max(1, partyLogo.naturalHeight) > 1.15; const logoWidth = wide ? 190 : 152; const logoHeight = wide ? 132 : 152; ctx.save(); ctx.beginPath(); ctx.arc(partyCenterX, partyCenterY, 99, 0, Math.PI * 2); ctx.clip(); drawContainImage(ctx, partyLogo, partyCenterX - logoWidth / 2, partyCenterY - logoHeight / 2, logoWidth, logoHeight); ctx.restore(); }
  else { ctx.fillStyle = "#552676"; ctx.font = "800 42px Inter, Arial, sans-serif"; ctx.textAlign = "center"; ctx.fillText((identity.party_name || "LOGO").slice(0, 4).toUpperCase(), partyCenterX, partyCenterY + 15); ctx.textAlign = "left"; }
  ctx.fillStyle = "#2F343A"; roundedRectPath(ctx, 76, 800, 210, 54, 27); ctx.fill(); ctx.fillStyle = "#FFFFFF"; ctx.font = "850 24px Inter, Arial, sans-serif"; ctx.fillText(person.file_code || `CRM-${person.id.slice(0, 8).toUpperCase()}`, 102, 836);
  const printed = splitContactName(person.full_name); ctx.fillStyle = "#2F343A"; drawFittedText(ctx, printed.first_names || "Sin nombre", 76, 930, 720); drawFittedText(ctx, printed.last_names || "\u00a0", 76, 1005, 720);
  ctx.fillStyle = "#08576E"; ctx.font = "700 29px Inter, Arial, sans-serif"; ctx.fillText(contactDisplayRole(person), 78, 1120); ctx.fillStyle = "#2F343A"; ctx.font = "800 24px Inter, Arial, sans-serif"; ctx.fillText((identity.party_name || "PARTIDO POLÍTICO").toUpperCase(), 78, 1180);
  if (person.contact_type === "Fiscal") { const payload = assignment?.payload ?? {}; const assigned = assignment ? `${String(payload.center_name || "Centro asignado")} · JRV ${String(payload.jrv || "—")}` : "JRV aún no asignada"; ctx.fillStyle = "#552676"; ctx.font = "800 21px Inter, Arial, sans-serif"; drawWrappedText(ctx, `DÍA D · ${assigned}`, 78, 1226, 900, 24); }
  ctx.fillStyle = "#2F343A"; ctx.fillRect(20, 1268, 1060, 82); if (radarLogo) drawContainImage(ctx, radarLogo, 355, 1281, 390, 56);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("No se pudo generar el carnet.")), "image/png"));
}

function TeamDirectoryCanonical() {
  const { campaign_id, municipality_code } = useMunicipalityContext();
  const [query, setQuery] = useState("");
  const [contactFilter, setContactFilter] = useState("all");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [contacts, setContacts] = useState<CampaignContactRecord[]>([]);
  const [identity, setIdentity] = useState<CampaignIdentityRecord>({});
  const [assignments, setAssignments] = useState<CampaignModuleRecord[]>([]);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState<ContactDraft>(emptyContact);
  const [carnetPerson, setCarnetPerson] = useState<CampaignContactRecord | null>(null);
  const [carnetPreviewUrl, setCarnetPreviewUrl] = useState("");
  const [linkedPersonOpened, setLinkedPersonOpened] = useState(false);

  const load = async () => {
    if (!campaign_id) return;
    const token = await ensureRadarAccessToken();
    const [rows, bundle, dayD] = await Promise.all([
      loadCampaignContacts(campaign_id, token), loadCampaignBundle(campaign_id, token), loadCampaignRecords(campaign_id, "dia-d", token),
    ]);
    setContacts(rows ?? []); setIdentity(bundle.identity ?? {}); setAssignments(dayD ?? []);
  };
  useEffect(() => { let cancelled = false; void load().catch((error: unknown) => { if (!cancelled) setMessage(error instanceof Error ? error.message : "No se pudo cargar el equipo."); }); return () => { cancelled = true; }; }, [campaign_id]);

  const visible = useMemo(() => {
    const term = query.trim().toLocaleLowerCase("es");
    return contacts.filter((contact) => (contactFilter === "all" || contact.contact_type === contactFilter) && (!term || `${contact.full_name} ${contact.phone ?? ""} ${contact.phone_secondary ?? ""} ${contact.email ?? ""} ${contact.community ?? ""} ${contact.role ?? ""} ${contact.candidate_position ?? ""}`.toLocaleLowerCase("es").includes(term)));
  }, [contactFilter, contacts, query]);
  const contactCodes = useMemo(() => {
    const counters = new Map<string, number>();
    const codes = new Map<string, string>();
    [...contacts].sort((a, b) => a.created_at.localeCompare(b.created_at)).forEach((contact) => {
      const canonicalType = normalizedContactType(contact.contact_type || "Equipo de campaña");
      const prefix = contactTypePrefixes[canonicalType] || "EC";
      const explicit = contact.file_code?.match(new RegExp(`^${prefix}(\\d+)$`, "i"));
      if (explicit) {
        counters.set(prefix, Math.max(counters.get(prefix) ?? 0, Number(explicit[1])));
        codes.set(contact.id, contact.file_code as string);
        return;
      }
      const next = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, next);
      codes.set(contact.id, `${prefix}${String(next).padStart(2, "0")}`);
    });
    return codes;
  }, [contacts]);
  const assignmentFor = (contactId: string) => assignments.find((record) => record.category === "ASIGNACION_JRV" && String(record.payload?.fiscal_id || "") === contactId);
  const openNew = () => { setEditing(null); setForm(emptyContact); setMessage(""); setOpen(true); };
  useEffect(() => {
    const add = () => openNew();
    const exportRows = () => downloadDirectoryExcel();
    window.addEventListener(DIRECTORY_ADD_EVENT, add);
    window.addEventListener(DIRECTORY_EXPORT_EVENT, exportRows);
    return () => {
      window.removeEventListener(DIRECTORY_ADD_EVENT, add);
      window.removeEventListener(DIRECTORY_EXPORT_EVENT, exportRows);
    };
  }, [visible, contactCodes, municipality_code]);
  const openEdit = (contact: CampaignContactRecord) => {
    const name = splitContactName(contact.full_name);
    setEditing(contact.id); setForm({ ...name, phone: contact.phone || "", phone_secondary: contact.phone_secondary || "", email: contact.email || "", community: contact.community || "", role: contact.role || "", contact_type: contact.contact_type, candidate_position: contact.candidate_position || "", notes: contact.notes || "", photo_url: contact.photo_url || "" }); setOpen(true);
  };
  useEffect(() => {
    if (linkedPersonOpened || !contacts.length) return;
    const personId = new URLSearchParams(window.location.search).get("personId");
    const person = personId ? contacts.find((item) => item.id === personId) : null;
    if (person) openEdit(person);
    setLinkedPersonOpened(true);
  }, [contacts, linkedPersonOpened]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!campaign_id) return; setSaving(true); setMessage("");
    try {
      const token = await ensureRadarAccessToken();
      const full_name = `${form.first_names} ${form.last_names}`.trim();
      const contactType = normalizedContactType(form.contact_type || "Equipo de campaña");
      const expectedPrefix = contactTypePrefixes[contactType] || "EC";
      const currentCode = editing ? contacts.find((item) => item.id === editing)?.file_code || "" : "";
      const fileCode = editing && new RegExp(`^${expectedPrefix}\\d+$`, "i").test(currentCode)
        ? currentCode
        : editing
          ? contactCodes.get(editing) || nextContactCode(contactType, contacts)
          : nextContactCode(contactType, contacts);
      const saved = await saveCampaignContact(campaign_id, { full_name, phone: form.phone, phone_secondary: form.phone_secondary, email: form.email, community: form.community, role: form.role, contact_type: contactType, candidate_position: form.candidate_position, notes: form.notes, photo_url: form.photo_url, file_code: fileCode, active: true, is_in_crm: true }, token, editing);
      setContacts((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => a.full_name.localeCompare(b.full_name, "es")));
      announceV70CampaignUpdate();
      setOpen(false); setEditing(null); setForm(emptyContact); setMessage(editing ? "Contacto actualizado." : "Contacto agregado al Campaign Vault.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar el contacto."); } finally { setSaving(false); }
  }
  async function downloadOne(contact: CampaignContactRecord) {
    setExporting(true);
    try { blobDownload(await carnetPng(contact, identity, assignmentFor(contact.id)), `carnet-${fileSlug(contact.full_name)}.png`); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo generar el carnet."); }
    finally { setExporting(false); }
  }
  async function openCarnet(contact: CampaignContactRecord) {
    setCarnetPerson(contact); setCarnetPreviewUrl("");
    try { const blob = await carnetPng(contact, identity, assignmentFor(contact.id)); setCarnetPreviewUrl(URL.createObjectURL(blob)); }
    catch (error) { setCarnetPerson(null); setMessage(error instanceof Error ? error.message : "No se pudo preparar el carnet."); }
  }
  function closeCarnet() {
    if (carnetPreviewUrl) URL.revokeObjectURL(carnetPreviewUrl);
    setCarnetPerson(null); setCarnetPreviewUrl("");
  }
  async function archive(contact: CampaignContactRecord) {
    if (!campaign_id || !window.confirm(`¿Borrar a “${contact.full_name}” del Directorio?`)) return;
    try { const token = await ensureRadarAccessToken(); await saveCampaignContact(campaign_id, { ...contact, active: false }, token, contact.id); setContacts((current) => current.filter((item) => item.id !== contact.id)); setMessage("Contacto borrado del Directorio."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo borrar el contacto."); }
  }
  async function downloadVisible() {
    if (!visible.length) return; setExporting(true); setMessage("");
    try {
      const files: Record<string, Uint8Array> = {};
      for (const contact of visible) files[`carnet-${fileSlug(contact.full_name)}.png`] = new Uint8Array(await (await carnetPng(contact, identity, assignmentFor(contact.id))).arrayBuffer());
      const archive = zipSync(files, { level: 6 });
      const archiveBuffer = archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer;
      blobDownload(new Blob([archiveBuffer], { type: "application/zip" }), `carnets-${contactFilter === "all" ? "todos" : fileSlug(contactFilter)}.zip`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudieron generar los carnets."); }
    finally { setExporting(false); }
  }
  function downloadDirectoryExcel() {
    const workbook = createRadarXlsx([{ name: "Equipo y responsables", title: "RADAR · Directorio CRM", subtitle: `Municipio ${municipality_code} · ${visible.length} contactos visibles`, headers: ["Código", "Nombre", "Tipo", "Cargo", "Comunidad", "Teléfono", "Teléfono secundario", "Correo"], rows: visible.map((contact) => [contactCodes.get(contact.id) || contact.file_code || "", contact.full_name, contact.contact_type, contact.candidate_position || contact.role || "", contact.community || "", contact.phone || "", contact.phone_secondary || "", contact.email || ""]), widths: [12, 34, 24, 28, 28, 18, 20, 32] }]);
    blobDownload(workbook, `RADAR_Directorio_${municipality_code}.xlsx`);
  }
  return <>
    <section className="crm-controlbar">
      <label className="crm-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar nombre, teléfono, comunidad o cargo" /></label>
      <label><span>Tipo de contacto</span><select value={contactFilter} onChange={(event) => setContactFilter(event.target.value)}><option value="all">Todos</option>{contactTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
      <button className="crm-bulk-carnets" type="button" disabled={exporting || !visible.length} onClick={() => void downloadVisible()}>{exporting ? "Preparando…" : `↓ Carnets (${visible.length})`}</button>
      <div className="crm-view-switch" aria-label="Cambiar vista"><button className={view === "cards" ? "active" : ""} onClick={() => setView("cards")}>Tarjetas</button><button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Lista</button></div>
    </section>
    <section className="crm-directory crm-directory-v2">
      <header><div><small>CAMPAIGN VAULT · PRIVADO</small><h2>{fmt.format(visible.length)} contactos visibles</h2><p>Equipo, responsables, fiscales y credenciales vinculados a la operación.</p></div></header>
      {message ? <p className="agenda-message" role="status">{message}</p> : null}
      {visible.length && view === "cards" ? <div className="crm-card-grid">{visible.map((contact) => { const assignment = assignmentFor(contact.id); const name = splitContactName(contact.full_name); return <article className="crm-contact-card" key={contact.id}>
        <header>{contact.photo_url ? <img className="crm-avatar" src={contact.photo_url} alt={`Fotografía de ${contact.full_name}`} /> : <i aria-hidden="true">{initials(contact.full_name)}</i>}<div><span className="crm-contact-code">{contactCodes.get(contact.id) || contact.file_code || "PENDIENTE"}</span><h3 className="crm-person-name"><span>{name.first_names || "Sin nombre"}</span><b>{name.last_names || "\u00a0"}</b></h3></div></header>
        <div className="crm-contact-meta"><span><small>COMUNIDAD</small><b>{contact.community || "Sin asignar"}</b></span><span><small>{contact.contact_type === "Candidato" ? "CANDIDATURA" : "TIPO DE CONTACTO"}</small><b>{contact.contact_type === "Candidato" ? contact.candidate_position || "Cargo pendiente" : contact.contact_type || "Sin clasificar"}</b></span></div>
        {contact.contact_type === "Fiscal" ? <div className={`crm-dayd-status ${assignment ? "assigned" : "pending"}`}><small>DÍA D</small><b>{assignment ? `${String(assignment.payload.center_name || "Centro asignado")} · JRV ${String(assignment.payload.jrv || "—")}` : "JRV aún no asignada"}</b></div> : null}
        <div className="crm-contact-lines"><span><b>Teléfono principal</b>{contact.phone ? <a href={`tel:${contact.phone.replace(/[^\d+]/g, "")}`}>{contact.phone}</a> : <em>Pendiente</em>}</span><span><b>Teléfono secundario</b>{contact.phone_secondary ? <a href={`tel:${contact.phone_secondary.replace(/[^\d+]/g, "")}`}>{contact.phone_secondary}</a> : <em>—</em>}</span><span><b>Correo</b>{contact.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : <em>Pendiente</em>}</span></div>
        {contact.notes ? <p className="crm-notes">{contact.notes}</p> : null}
        <footer><div className="crm-card-actions"><Link to={`/municipio/${municipality_code}/agenda?new=1&responsiblePersonId=${contact.id}&responsible=${encodeURIComponent(contact.full_name)}&community=${encodeURIComponent(contact.community || "")}`}>Crear actividad</Link><div className="crm-card-secondary"><button className="print-action" type="button" onClick={() => void openCarnet(contact)}>Imprimir</button><button className="open-action" type="button" onClick={() => openEdit(contact)}>Abrir</button><button className="delete-action" type="button" onClick={() => void archive(contact)}>Borrar</button></div></div></footer>
      </article>; })}</div> : visible.length ? <div className="crm-table crm-table-v2"><div className="crm-row crm-head"><span>Persona</span><span>Código</span><span>Comunidad</span><span>Contacto</span><span>Calidad</span><span>Acciones</span></div>{visible.map((contact) => { const missing = [contact.phone, contact.community, contact.contact_type].filter((value) => !value).length; return <article className="crm-row" key={contact.id} onClick={() => openEdit(contact)}><span>{contact.photo_url ? <img className="crm-avatar" src={contact.photo_url} alt="" /> : <i>{initials(contact.full_name)}</i>}<b>{contact.full_name}</b></span><span>{contactCodes.get(contact.id) || contact.file_code || "Pendiente"}</span><span>{contact.community || "Pendiente"}</span><span>{contact.phone || contact.email || "Pendiente"}</span><span><em className={missing ? "incomplete" : ""}>{missing ? `${missing} pendiente${missing === 1 ? "" : "s"}` : "Completo"}</em></span><span className="crm-table-actions"><button className="crm-table-carnet" type="button" onClick={(event) => { event.stopPropagation(); void openCarnet(contact); }}>Imprimir</button><button className="crm-table-delete" type="button" onClick={(event) => { event.stopPropagation(); void archive(contact); }}>Borrar</button></span></article>; })}</div> : <div className="agenda-empty"><b>{contacts.length ? "No hay contactos con estos filtros." : "El Directorio está listo para recibir tu base."}</b><span>{contacts.length ? "Cambia los filtros o la búsqueda." : "Agrega el primer contacto del equipo."}</span><div><button type="button" onClick={openNew}>Agregar contacto</button></div></div>}
    </section>
    {open ? <div className="agenda-modal" role="dialog" aria-modal="true"><form className="crm-person-form" onSubmit={save}>
      <header><div><small>DIRECTORIO CRM</small><h2>{editing ? "Editar contacto" : "Nuevo contacto"}</h2><p>El nombre es obligatorio. En candidaturas puedes completar el teléfono después.</p></div><button type="button" onClick={() => setOpen(false)}>×</button></header>
      <div className="agenda-form-grid">
        <div className="wide photo-editor-field"><span>Fotografía</span><V70PhotoEditor currentSrc={form.photo_url} onChange={(photo_url) => setForm((current) => ({ ...current, photo_url }))} onError={setMessage} /></div>
        <label><span>Nombres *</span><input autoFocus required value={form.first_names} onChange={(event) => setForm({ ...form, first_names: event.target.value })} placeholder="Primer y segundo nombre" /></label>
        <label><span>Apellidos *</span><input required value={form.last_names} onChange={(event) => setForm({ ...form, last_names: event.target.value })} placeholder="Apellidos" /></label>
        <label><span>Teléfono / WhatsApp {form.contact_type === "Candidato" ? "" : "*"}</span><input required={form.contact_type !== "Candidato"} inputMode="tel" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="Ej. 5555 5555" /></label>
        <label><span>Teléfono secundario</span><input inputMode="tel" value={form.phone_secondary} onChange={(event) => setForm({ ...form, phone_secondary: event.target.value })} /></label>
        <label><span>Correo</span><input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="nombre@correo.com" /></label>
        <label><span>Comunidad</span><input value={form.community} onChange={(event) => setForm({ ...form, community: event.target.value })} placeholder="Aldea, colonia o sector" /></label>
        <label><span>Cargo o función</span><input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="Ej. Coordinadora territorial" /></label>
        <label><span>Tipo de contacto</span><select required value={form.contact_type} onChange={(event) => setForm({ ...form, contact_type: event.target.value, candidate_position: event.target.value === "Candidato" ? form.candidate_position : "" })}><option value="">Seleccionar…</option>{contactTypes.map((item) => <option key={item}>{item}</option>)}</select></label>
        {form.contact_type === "Candidato" ? <label><span>Puesto al que se postula *</span><select required value={form.candidate_position} onChange={(event) => setForm({ ...form, candidate_position: event.target.value })}><option value="">Seleccionar candidatura…</option>{candidatePositions.map((position) => <option key={position} value={position}>{position}</option>)}</select></label> : null}
        {form.contact_type === "Fiscal" ? <aside className="crm-dayd-form-status wide"><small>ASIGNACIÓN DÍA D</small><b>{editing && assignmentFor(editing) ? `${String(assignmentFor(editing)?.payload.center_name || "Centro asignado")} · JRV ${String(assignmentFor(editing)?.payload.jrv || "—")}` : "JRV aún no asignada"}</b><span>La asignación se administra desde Día D → Centros de votación.</span></aside> : null}
        <label className="wide"><span>Notas</span><textarea rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} placeholder="Información breve que ayude al equipo" /></label>
      </div>
      {message ? <p className="form-error">{message}</p> : null}<footer>{editing ? <Link className="agenda-create-link" to={`/municipio/${municipality_code}/agenda?new=1&responsiblePersonId=${editing}&responsible=${encodeURIComponent(`${form.first_names} ${form.last_names}`.trim())}&community=${encodeURIComponent(form.community)}`}>Crear actividad</Link> : <span />}<button type="button" onClick={() => setOpen(false)}>Cancelar</button><button disabled={saving}>{saving ? "Guardando…" : editing ? "Guardar cambios" : "Guardar contacto"}</button></footer>
    </form></div> : null}
    {carnetPerson ? <div className="agenda-modal" role="dialog" aria-modal="true" aria-label={`Carnet de ${carnetPerson.full_name}`}><section className="crm-carnet-modal"><header><div><small>CARNET IMPRIMIBLE</small><h2>Así se descargará</h2></div><button type="button" onClick={closeCarnet}>×</button></header><div className="crm-carnet-output">{carnetPreviewUrl ? <img src={carnetPreviewUrl} alt={`Vista final imprimible del carnet de ${carnetPerson.full_name}`} /> : <span>Preparando carnet…</span>}</div><footer><button type="button" onClick={closeCarnet}>Cerrar</button><button type="button" disabled={!carnetPreviewUrl} onClick={() => void downloadOne(carnetPerson)}>Descargar PNG</button></footer></section></div> : null}
  </>;
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
        {mode === "team" ? <div className="crm-banner-actions"><button className="secondary" type="button" onClick={() => window.dispatchEvent(new Event(DIRECTORY_EXPORT_EVENT))}>↓ Descargar Excel</button><button type="button" onClick={() => window.dispatchEvent(new Event(DIRECTORY_ADD_EVENT))}>+ Agregar contacto</button></div> : null}
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
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="directorio"
        eyebrow="RELACIONES"
        topbarTitle={municipalityTitle}
      >
        <DirectoryContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
