import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { signOutRadar } from "../data/radarAuth";
import {
  runAdminAction,
  uploadPublicationPreview,
  type AdminMunicipalityState,
  type AdminSnapshot,
} from "./radarAdminApi";

const sections = [
  ["resumen", "Resumen nacional", "⌂"],
  ["municipios", "Municipios y campañas", "◎"],
  ["exclusividad", "Disponibilidad y contratos", "◇"],
  ["usuarios", "Usuarios y permisos", "♙"],
  ["data-vault", "Datos municipales", "▥"],
  ["publicaciones", "Cargas y publicaciones", "⇧"],
  ["campaign-vault", "Actividad de campañas", "▣"],
  ["pulso", "Encuestas · Pulso", "◒"],
  ["rtd", "Día D · monitoreo", "▤"],
  ["qa", "Estado técnico", "✓"],
  ["auditoria", "Historial de cambios", "≡"],
  ["soporte", "Soporte", "?"],
] as const;

type SectionId = (typeof sections)[number][0];
type Action = (
  operation: string,
  input: Record<string, unknown>,
) => Promise<boolean>;
interface ActionModuleProps {
  snapshot: AdminSnapshot;
  action: Action;
  busy: boolean;
}

const sectionCopy: Record<SectionId, { eyebrow: string; description: string }> =
  {
    resumen: {
      eyebrow: "OPERACIÓN NACIONAL",
      description:
        "Revisá tus campañas, encontrá un municipio y resolvé lo que requiere atención.",
    },
    municipios: {
      eyebrow: "COBERTURA TERRITORIAL",
      description:
        "Buscá un municipio, revisá su estado y administrá campañas sin duplicar aplicaciones.",
    },
    exclusividad: {
      eyebrow: "PROTECCIÓN COMERCIAL",
      description:
        "Consultá qué municipios están reservados y administrá sus contratos y fechas de vigencia.",
    },
    usuarios: {
      eyebrow: "ACCESO Y SEGURIDAD",
      description:
        "Administrá a las personas de tu equipo interno: su función, territorio y acceso a esta consola.",
    },
    "data-vault": {
      eyebrow: "DATOS OFICIALES",
      description:
        "Consultá la información electoral, territorial y municipal disponible, su fuente y fecha de actualización.",
    },
    publicaciones: {
      eyebrow: "CONTROL DE VERSIONES",
      description:
        "Toda carga pasa por vista previa, validación, aprobación y publicación antes de llegar al cliente.",
    },
    "campaign-vault": {
      eyebrow: "SALUD OPERATIVA",
      description:
        "Revisá el nivel de actividad y la última actualización de cada campaña.",
    },
    pulso: {
      eyebrow: "INVESTIGACIÓN ELECTORAL",
      description:
        "Encuestas versionadas con alcance municipal, departamental o nacional y ficha técnica obligatoria.",
    },
    rtd: {
      eyebrow: "MONITOREO DÍA D",
      description:
        "Controlá la recepción de actas, la cobertura de fiscales y los incidentes de cada campaña.",
    },
    qa: {
      eyebrow: "CALIDAD Y ENTREGA",
      description:
        "Pruebas, builds, rutas y versiones listas para revisión antes de abrir cualquier compuerta.",
    },
    auditoria: {
      eyebrow: "TRAZABILIDAD",
      description:
        "Quién hizo qué, cuándo, desde qué rol y con qué motivo, sin alterar el historial.",
    },
    soporte: {
      eyebrow: "DIAGNÓSTICO CONTROLADO",
      description:
        "Acceso temporal, mínimo y visible para resolver incidentes sin suplantar al usuario.",
    },
  };

const text = (value: unknown, fallback = "—") =>
  value === null || value === undefined || value === ""
    ? fallback
    : String(value);
const number = (value: unknown) => Number(value ?? 0).toLocaleString("es-GT");
const date = (value: unknown) => {
  if (!value) return "Sin actualización";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime())
    ? text(value)
    : new Intl.DateTimeFormat("es-GT", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(parsed);
};

const labels: Record<string, string> = {
  super_admin: "Superadministrador",
  data_ops: "Operación de datos",
  support: "Soporte",
  qa: "Control de calidad",
  commercial_ops: "Operación comercial",
  rtd_ops: "Operación RTD",
  CONTRACT_PROTECTED: "Contrato protegido",
  CAMPAIGN_CONFIGURED: "Campaña configurada",
  DATA_ONLY: "Solo datos",
  ACTIVE: "Activo",
  RESERVED: "Reservado",
  SUSPENDED: "Suspendido",
  PAUSED: "En pausa",
  UPLOADED: "Cargado",
  PREVALIDATED: "Prevalidado",
  APPROVED: "Aprobado",
  PUBLISHED: "Publicado",
  ROLLED_BACK: "Revertido",
  BORRADOR: "Borrador",
  PREVALIDADA: "Prevalidada",
  APROBADA: "Aprobada",
  PUBLICADA: "Publicada",
  MUNICIPALITY: "Municipal",
  DEPARTMENT: "Departamental",
  NATIONAL: "Nacional",
  ALCALDIA: "Alcaldía",
  DIP_DIST: "Diputación distrital",
  DIP_NAC: "Listado nacional",
  PRESIDENTE: "Presidencia",
  PARLACEN: "Parlacen",
  READ_ONLY: "Solo lectura",
  MINIMAL_DIAGNOSTIC: "Diagnóstico mínimo",
  PASSED: "Aprobado",
  FAILED: "Falló",
  READY: "Listo",
};

function statusLabel(value: unknown) {
  const raw = text(value);
  return (
    labels[raw] ??
    raw
      .replaceAll("_", " ")
      .toLocaleLowerCase("es-GT")
      .replace(/^./, (letter) => letter.toUpperCase())
  );
}

function municipalityLabel(snapshot: AdminSnapshot, code: unknown) {
  const found = snapshot.municipalities.find(
    (item) => item.municipality_code === String(code),
  );
  return found
    ? `${found.municipality_name} · ${found.department_name}`
    : text(code);
}

export function SuperAdminApp({
  snapshot,
  onRefresh,
}: {
  snapshot: AdminSnapshot;
  onRefresh: () => Promise<void>;
}) {
  const { section } = useParams();
  const active = (
    sections.some(([id]) => id === section) ? section : "resumen"
  ) as SectionId;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionFailed, setActionFailed] = useState(false);
  const [dark, setDark] = useState(false);
  const activeDefinition = sections.find(([id]) => id === active)!;
  const meta = sectionCopy[active];
  const logo = `${import.meta.env.BASE_URL}brand/radar-electoral-logo-horizontal-oscuro-transparente.svg`;

  useEffect(() => {
    setMenuOpen(false);
    window.scrollTo(0, 0);
  }, [active]);
  useEffect(() => {
    const saved = window.localStorage.getItem("radar-theme") === "dark";
    setDark(saved);
    document.documentElement.dataset.theme = saved ? "dark" : "light";
  }, []);

  async function action<T>(operation: string, input: Record<string, unknown>) {
    setActionBusy(true);
    setActionMessage(null);
    setActionFailed(false);
    try {
      await runAdminAction<T>(operation, input);
      setActionMessage(
        "Operación completada. El cambio quedó registrado en auditoría.",
      );
      await onRefresh();
      return true;
    } catch (error) {
      setActionFailed(true);
      setActionMessage(
        error instanceof Error
          ? error.message
          : "No se pudo completar la operación.",
      );
      return false;
    } finally {
      setActionBusy(false);
    }
  }

  function toggleTheme() {
    setDark((current) => {
      const next = !current;
      document.documentElement.dataset.theme = next ? "dark" : "light";
      window.localStorage.setItem("radar-theme", next ? "dark" : "light");
      return next;
    });
  }

  async function logout() {
    try { await signOutRadar(); }
    finally { navigate("/acceso?next=/admin", { replace: true }); }
  }

  return (
    <div className="superadmin-shell">
      <button
        className={
          menuOpen ? "superadmin-scrim is-visible" : "superadmin-scrim"
        }
        type="button"
        aria-label="Cerrar navegación"
        onClick={() => setMenuOpen(false)}
      />
      <aside
        className={
          menuOpen ? "superadmin-sidebar is-open" : "superadmin-sidebar"
        }
      >
        <div className="superadmin-brand">
          <img src={logo} alt="RADAR Inteligencia Electoral" />
        </div>
        <nav aria-label="Navegación del superadministrador">
          {sections.map(([id, label, icon]) => (
            <NavLink
              key={id}
              to={`/admin/${id}`}
              className={() => (active === id ? "active" : undefined)}
            >
              <span aria-hidden="true">{icon}</span>
              <b>{label}</b>
              {id === "rtd" ? <small>DÍA D</small> : null}
            </NavLink>
          ))}
        </nav>
        <div className="superadmin-identity">
          <span>
            {snapshot.operator_context.user_role.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <strong>{statusLabel(snapshot.operator_context.user_role)}</strong>
            <small>Verificación en dos pasos activa</small>
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Cerrar sesión"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      <main className="superadmin-workspace">
        <header className="superadmin-topbar">
          <button
            className="superadmin-menu"
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Abrir navegación"
          >
            ☰
          </button>
          <img
            className="superadmin-topbar-mark"
            src={`${import.meta.env.BASE_URL}brand/radar-isotipo.svg`}
            alt=""
            aria-hidden="true"
          />
          <div className="superadmin-topbar-title">
            <small>CENTRO DE MANDO NACIONAL</small>
            <b>{activeDefinition[1]}</b>
          </div>
          <div className="superadmin-top-actions">
            <span className="superadmin-environment">
              <i /> Entorno de pruebas
            </span>
            <button type="button" onClick={() => void onRefresh()}>
              ↻ <span>Actualizar</span>
            </button>
            <button
              type="button"
              onClick={toggleTheme}
              aria-label={
                dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"
              }
            >
              {dark ? "☀" : "◐"}
            </button>
            <span className="superadmin-country" aria-label="Guatemala">
              🇬🇹
            </span>
          </div>
        </header>

        <div className="superadmin-content">
          <section className="superadmin-hero">
            <div>
              <span>{meta.eyebrow}</span>
              <h1>{activeDefinition[1]}</h1>
              <p>{meta.description}</p>
            </div>
            <aside>
              <small>ÚLTIMA ACTUALIZACIÓN</small>
              <strong>{date(snapshot.generated_at)}</strong>
              <span>
                <i /> Sesión y alcance verificados
              </span>
            </aside>
          </section>

          {actionMessage ? (
            <div className={`superadmin-action-message${actionFailed ? " is-error" : ""}`} role={actionFailed ? "alert" : "status"}>
              <span>{actionFailed ? "!" : "✓"}</span>
              {actionMessage}
              <button
                type="button"
                onClick={() => setActionMessage(null)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
          ) : null}
          <SectionRouter
            active={active}
            snapshot={snapshot}
            action={action}
            busy={actionBusy}
          />
        </div>
      </main>
    </div>
  );
}

function SectionRouter({
  active,
  snapshot,
  action,
  busy,
}: {
  active: SectionId;
  snapshot: AdminSnapshot;
  action: Action;
  busy: boolean;
}) {
  if (active === "resumen") return <NationalSummary snapshot={snapshot} />;
  if (active === "municipios")
    return (
      <MunicipalitiesModule snapshot={snapshot} action={action} busy={busy} />
    );
  if (active === "exclusividad")
    return (
      <ExclusivityModule snapshot={snapshot} action={action} busy={busy} />
    );
  if (active === "usuarios")
    return <UsersModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "data-vault")
    return <DataVaultModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "publicaciones")
    return (
      <PublicationModule snapshot={snapshot} action={action} busy={busy} />
    );
  if (active === "campaign-vault")
    return <CampaignVaultModule snapshot={snapshot} />;
  if (active === "pulso")
    return <PulseModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "rtd") return <RtdModule snapshot={snapshot} />;
  if (active === "qa") return <QaModule snapshot={snapshot} />;
  if (active === "auditoria") return <AuditModule snapshot={snapshot} />;
  return <SupportModule snapshot={snapshot} action={action} busy={busy} />;
}

function NationalSummary({ snapshot }: { snapshot: AdminSnapshot }) {
  const recentAudit = snapshot.audit.slice(0, 5);
  const layerPending = snapshot.municipalities.filter(
    (item) => item.canonical_layers_present < 17,
  ).length;
  const publicationBlockers = snapshot.publication_issues.filter((item) =>
    ["BLOCKER", "ERROR"].includes(String(item.severity)),
  ).length;
  const mfaPending = snapshot.users.filter((item) => !item.mfa_enrolled).length;
  const rtdAlerts = snapshot.rtd.reduce(
    (total, item) => total + Number(item.open_incidents ?? 0),
    0,
  );
  const attention = [
    {
      label: "Datos por completar",
      detail: `${number(layerPending)} municipios tienen grupos de información pendientes`,
      value: layerPending,
      to: "/admin/data-vault",
    },
    {
      label: "Publicaciones bloqueadas",
      detail: `${number(publicationBlockers)} errores o bloqueos requieren revisión`,
      value: publicationBlockers,
      to: "/admin/publicaciones",
    },
    {
      label: "Verificación en dos pasos pendiente",
      detail: `${number(mfaPending)} personas deben activar el código de seguridad adicional`,
      value: mfaPending,
      to: "/admin/usuarios",
    },
    {
      label: "Alertas RTD",
      detail: `${number(rtdAlerts)} incidentes abiertos en campañas con operación Día D`,
      value: rtdAlerts,
      to: "/admin/rtd",
    },
  ].sort((a, b) => b.value - a.value);

  return (
    <>
      <div className="superadmin-kpis">
        <Kpi
          label="Cobertura nacional"
          value={`${number(snapshot.national.municipalities)} / 340`}
          note={`${number(snapshot.national.departments)} departamentos registrados`}
          tone="petrol"
        />
        <Kpi
          label="Municipios con datos presentes"
          value={number(snapshot.national.municipalities_with_17_layers)}
          note="17 grupos de información presentes; revisá su validación en Datos municipales"
          tone="purple"
        />
        <Kpi
          label="Campañas activas"
          value={number(snapshot.national.active_campaigns)}
          note="Espacios de clientes habilitados para operar"
          tone="graphite"
        />
        <Kpi
          label="Exclusividades vigentes"
          value={number(snapshot.national.protected_contracts)}
          note="Municipios reservados o contratados dentro de su vigencia"
          tone="green"
        />
      </div>
      <div className="superadmin-grid superadmin-grid--priority">
        <Panel
          eyebrow="SIGUIENTE ACCIÓN"
          title="Qué requiere atención"
          action={<Link to="/admin/auditoria">Ver actividad</Link>}
        >
          <div className="superadmin-attention">
            {attention.map((item) => (
              <Link
                key={item.label}
                to={item.to}
                className={item.value ? "has-signal" : "is-clear"}
              >
                <span>{item.value ? number(item.value) : "✓"}</span>
                <div>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </div>
                <b>›</b>
              </Link>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="ACCESOS DIRECTOS" title="Operación frecuente">
          <div className="superadmin-shortcuts">
            <Link to="/admin/municipios">
              <span>◎</span>
              <div>
                <strong>Buscar municipio</strong>
                <small>Campañas y estado territorial</small>
              </div>
            </Link>
            <Link to="/admin/publicaciones">
              <span>⇧</span>
              <div>
                <strong>Nueva publicación</strong>
                <small>Carga y vista previa</small>
              </div>
            </Link>
            <Link to="/admin/usuarios">
              <span>♙</span>
              <div>
                <strong>Administrar equipo RADAR</strong>
                <small>Invitar, suspender y reactivar personal interno</small>
              </div>
            </Link>
            <Link to="/admin/soporte">
              <span>?</span>
              <div>
                <strong>Resolver un incidente</strong>
                <small>Soporte con permiso y duración definidos</small>
              </div>
            </Link>
          </div>
        </Panel>
      </div>
      <div className="superadmin-grid superadmin-grid--wide">
        <Panel
          eyebrow="CONTROL DE CALIDAD"
          title="Municipios de prueba"
        >
          <div className="superadmin-verticals">
            {snapshot.vertical_qa.map((municipality) => (
              <MunicipalitySignal
                key={municipality.municipality_code}
                municipality={municipality}
              />
            ))}
          </div>
        </Panel>
        <Panel eyebrow="ACTIVIDAD RECIENTE" title="Últimos movimientos">
          <EmptyOr
            rows={recentAudit}
            empty="Todavía no hay eventos administrativos verificados."
          >
            {recentAudit.map((event) => (
              <TimelineRow
                key={text(event.id)}
                title={statusLabel(event.action)}
                detail={`${text(event.entity_type)} · ${text(event.reason)}`}
                meta={date(event.created_at)}
              />
            ))}
          </EmptyOr>
        </Panel>
      </div>
    </>
  );
}

function MunicipalitiesModule({ snapshot, action, busy }: ActionModuleProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("ALL");
  const [dialog, setDialog] = useState(false);
  const items = useMemo(
    () =>
      snapshot.municipalities.filter((item) => {
        const haystack =
          `${item.municipality_code} ${item.municipality_name} ${item.department_name}`.toLowerCase();
        return (
          (!query || haystack.includes(query.toLowerCase())) &&
          (department === "ALL" || item.department_code === department)
        );
      }),
    [snapshot.municipalities, query, department],
  );
  const departments = useMemo(
    () =>
      Array.from(
        new Map(
          snapshot.municipalities.map((item) => [
            item.department_code,
            item.department_name,
          ]),
        ).entries(),
      ),
    [snapshot.municipalities],
  );
  const protectedContracts = snapshot.contracts.filter((item) =>
    ["RESERVED", "ACTIVE"].includes(String(item.status)),
  );
  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const contract = protectedContracts.find(
      (item) => String(item.id) === String(form.contract_id),
    );
    if (!contract) return;
    const completed = await action("create_campaign", {
      municipality_code: contract.municipality_code,
      organization_id: contract.client_organization_id,
      name: form.name,
      slug: form.slug,
      status: form.status,
      reason: form.reason,
    });
    if (completed) setDialog(false);
  }
  return (
    <>
      <Panel
        eyebrow="INVENTARIO REAL"
        title="340 municipios · una sola plataforma"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setDialog(true)}
          >
            + Nueva campaña
          </button>
        }
      >
        <div className="superadmin-filters">
          <label>
            <span>Buscar</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Municipio, código o departamento"
            />
          </label>
          <label>
            <span>Departamento</span>
            <select
              value={department}
              onChange={(event) => setDepartment(event.target.value)}
            >
              <option value="ALL">Todos los departamentos</option>
              {departments.map(([code, name]) => (
                <option key={code} value={code}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <strong>{number(items.length)} resultados</strong>
        </div>
        <DataTable
          headers={[
            "Municipio",
            "Cobertura",
            "Campañas",
            "Protección",
            "Actualización",
            "",
          ]}
        >
          {items.map((item) => (
            <tr key={item.municipality_code}>
              <td>
                <strong>{item.municipality_name}</strong>
                <small>
                  {item.department_name} · {item.municipality_code}
                </small>
              </td>
              <td>
                <Progress
                  value={item.canonical_layers_present}
                  max={17}
                  label={`${item.canonical_layers_present}/17 grupos`}
                />
              </td>
              <td>{number(item.active_campaigns)}</td>
              <td>
                <Status value={item.operational_state} />
              </td>
              <td>{date(item.data_updated_at)}</td>
              <td>
                <Link
                  className="superadmin-row-action"
                  to={`/municipio/${item.municipality_code}`}
                >
                  Abrir ↗
                </Link>
              </td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        eyebrow="CAMPAÑA PROTEGIDA"
        title="Crear una campaña"
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void createCampaign(event)}
        >
          <Step
            number="1"
            title="Elegí el contrato"
            detail="Solo aparecen territorios con una reserva vigente."
          />
          <Field label="Territorio protegido">
            <select name="contract_id" required defaultValue="">
              <option value="" disabled>
                Seleccionar contrato y municipio
              </option>
              {protectedContracts.map((contract) => (
                <option key={text(contract.id)} value={text(contract.id)}>
                  {municipalityLabel(snapshot, contract.municipality_code)} ·{" "}
                  {text(contract.contract_ref)}
                </option>
              ))}
            </select>
          </Field>
          {!protectedContracts.length ? (
            <InlineNotice>
              No hay una reserva vigente disponible. Creala primero en
              Disponibilidad y contratos.
            </InlineNotice>
          ) : null}
          <Step
            number="2"
            title="Identificá la campaña"
            detail="El código interno se genera sin exponerlo al operador."
          />
          <Field label="Nombre de campaña">
            <input
              name="name"
              required
              placeholder="Ej. Alcaldía San José 2027"
            />
          </Field>
          <Field label="Dirección web">
            <div className="superadmin-prefix">
              <span>radar.gt/</span>
              <input name="slug" required placeholder="san-jose-2027" />
            </div>
          </Field>
          <Field label="Estado inicial">
            <select name="status" defaultValue="paused">
              <option value="paused">
                En pausa hasta completar configuración
              </option>
              <option value="active">Activa</option>
            </select>
          </Field>
          <Field label="Motivo y autorización">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Quién autorizó el alta y por qué"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Crear campaña protegida"
            onCancel={() => setDialog(false)}
            disabled={!protectedContracts.length}
          />
        </form>
      </Dialog>
    </>
  );
}

function ExclusivityModule({ snapshot, action, busy }: ActionModuleProps) {
  const [dialog, setDialog] = useState(false);
  const [release, setRelease] = useState<Record<string, unknown> | null>(null);
  async function releaseContract(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!release) return;
    const completed = await action("release_contract", { ...Object.fromEntries(new FormData(event.currentTarget)), contract_id: release.id });
    if (completed) setRelease(null);
  }
  const organizationChoices = Array.from(
    new Map(
      snapshot.contracts.map((item) => [
        String(item.client_organization_id ?? ""),
        `Cliente · ${text(item.contract_ref)}`,
      ]),
    ).entries(),
  ).filter(([id]) => id);
  async function reserve(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const completed = await action(
      "reserve_contract",
      Object.fromEntries(new FormData(event.currentTarget).entries()),
    );
    if (completed) setDialog(false);
  }
  return (
    <>
      <div className="superadmin-info-strip">
        <span>◇</span>
        <div>
          <strong>Un cliente por municipio durante la vigencia del contrato.</strong>
          <p>
            El sistema impide reservar el mismo municipio para dos clientes en
            fechas que se superponen.
          </p>
        </div>
      </div>
      <Panel
        eyebrow="CONTRATOS Y RESERVAS"
        title="Territorios protegidos"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setDialog(true)}
          >
            + Reservar municipio
          </button>
        }
      >
        <EmptyOr
          rows={snapshot.contracts}
          empty="No hay contratos registrados en el entorno QA."
        >
          <DataTable
            headers={[
              "Municipio",
              "Referencia",
              "Vigencia",
              "Estado",
              "Actualización", "",
            ]}
          >
            {snapshot.contracts.map((contract) => (
              <tr key={text(contract.id)}>
                <td>
                  <strong>
                    {municipalityLabel(snapshot, contract.municipality_code)}
                  </strong>
                  <small>{text(contract.municipality_code)}</small>
                </td>
                <td>{text(contract.contract_ref)}</td>
                <td>
                  {text(contract.valid_from)} →{" "}
                  {text(contract.valid_until, "Sin fecha final")}
                </td>
                <td>
                  <Status value={contract.status} />
                </td>
                <td>{date(contract.updated_at)}</td>
                <td>{["RESERVED", "ACTIVE", "SUSPENDED"].includes(text(contract.status)) && snapshot.operator_context?.user_role === "super_admin" && <button type="button" className="superadmin-row-button" disabled={busy} onClick={() => setRelease(contract)}>Liberar</button>}</td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Dialog open={Boolean(release)} onClose={() => { if (!busy) setRelease(null); }} eyebrow="DISPONIBILIDAD" title="Finalizar contrato y liberar municipio">
        <form className="superadmin-form" onSubmit={e => void releaseContract(e)}>
          <p>Se finalizará el contrato <strong>{text(release?.contract_ref)}</strong>. La campaña vinculada quedará pausada y se retirarán sus accesos. Su información privada se conserva.</p>
          <p>Otros contratos vigentes o futuros del municipio conservarán su protección.</p>
          <Field label="Escribe la referencia del contrato para confirmar"><input name="confirmation" required autoComplete="off" /></Field>
          <Field label="Motivo"><textarea name="reason" required minLength={3} /></Field>
          <button type="submit" className="superadmin-primary" disabled={busy}>{busy ? "Finalizando…" : "Finalizar y retirar accesos"}</button>
        </form>
      </Dialog>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        eyebrow="NUEVA RESERVA"
        title="Proteger un municipio"
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void reserve(event)}
        >
          <Step
            number="1"
            title="Territorio y cliente"
            detail="El sistema comprobará conflictos antes de guardar."
          />
          <Field label="Municipio">
            <select name="municipality_code" required defaultValue="">
              <option value="" disabled>
                Buscar municipio
              </option>
              {snapshot.municipalities.map((item) => (
                <option
                  key={item.municipality_code}
                  value={item.municipality_code}
                >
                  {item.municipality_name} · {item.department_name} (
                  {item.municipality_code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Cliente existente">
            <select name="organization_id" required defaultValue="">
              <option value="" disabled>
                Seleccionar cliente autorizado
              </option>
              {organizationChoices.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          {!organizationChoices.length ? (
            <InlineNotice>
              Primero debe existir una organización contratante autorizada. No
              se aceptan identificadores manuales en este flujo.
            </InlineNotice>
          ) : null}
          <Step
            number="2"
            title="Período contractual"
            detail="Las fechas determinan la protección exclusiva."
          />
          <div className="superadmin-form-grid">
            <Field label="Inicio">
              <input name="valid_from" type="date" required />
            </Field>
            <Field label="Final">
              <input name="valid_until" type="date" required />
            </Field>
          </div>
          <Field label="Referencia contractual">
            <input
              name="contract_ref"
              required
              placeholder="Ej. RADAR-2027-0509"
            />
          </Field>
          <input type="hidden" name="status" value="RESERVED" />
          <Field label="Motivo y autorización">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Documento o autorización que respalda la reserva"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Comprobar y reservar"
            onCancel={() => setDialog(false)}
            disabled={!organizationChoices.length}
          />
        </form>
      </Dialog>
    </>
  );
}

const campaignRoleNames: Record<string, string> = {
  campaign_admin: "Administrador", campaign_editor: "Editor", campaign_viewer: "Solo consulta",
  demo_admin: "Administrador demo", demo_viewer: "Consulta demo",
};
function CampaignMembersPanel({ snapshot, action, busy }: ActionModuleProps) {
  const [campaignId, setCampaignId] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<Record<string, unknown> | null>(null);
  const [inviting, setInviting] = useState(false);
  const campaign = snapshot.campaigns.find(c => String(c.id) === campaignId);
  const roles = campaign?.is_demo ? ["demo_admin", "demo_viewer"] : ["campaign_admin", "campaign_editor", "campaign_viewer"];
  const users = new Map(snapshot.users.map(u => [String(u.id), u]));
  const members = (snapshot.campaign_members ?? []).filter(m => String(m.campaign_id) === campaignId);
  const shown = members.filter(m => String(users.get(String(m.user_id))?.email ?? m.user_id).toLowerCase().includes(query.toLowerCase()));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const completed = await action(editing ? "assign_campaign_member" : "invite_campaign_member", {
      ...form, campaign_id: campaignId, ...(editing ? { user_id: editing.user_id } : {}),
      member_role: form.member_role === "remove" ? null : form.member_role,
    });
    if (completed) { setEditing(null); setInviting(false); }
  }
  return <Panel eyebrow="ACCESOS MUNICIPALES" title="Usuarios de cada campaña" action={<button type="button" className="superadmin-primary" disabled={!campaign || busy} onClick={() => setInviting(true)}>+ Agregar usuario</button>}>
    <p>Selecciona una campaña para administrar su equipo. Cada persona usa su propio correo y contraseña.</p>
    <div className="superadmin-form">
      <Field label="Municipio y campaña"><select value={campaignId} onChange={e => { setCampaignId(e.target.value); setQuery(""); }}><option value="">Selecciona una campaña</option>{snapshot.campaigns.map(c => <option key={text(c.id)} value={text(c.id)}>{text(c.municipality_code)} · {text(c.name)}{c.is_demo ? " · Demo" : ""}</option>)}</select></Field>
      {campaign && <Field label={`Buscar entre ${members.length} usuarios asignados`}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Correo del usuario" /></Field>}
    </div>
    {campaign && <><p><strong>Administrador:</strong> gestión de campaña. <strong>Editor:</strong> captura y edición según los permisos del módulo. <strong>Consulta:</strong> lectura. Las demos usan sus propios roles.</p>
      <EmptyOr rows={shown} empty={members.length ? "No hay coincidencias para este correo." : "Agrega primero a la persona responsable de la campaña."}><DataTable headers={["Correo", "Rol", "", ""]}>{shown.map(m => <tr key={text(m.user_id)}><td>{text(users.get(String(m.user_id))?.email, text(m.user_id))}</td><td>{campaignRoleNames[text(m.member_role)] ?? text(m.member_role)}</td><td>{users.get(String(m.user_id))?.last_sign_in_at ? "Ya ingresó" : "Primer ingreso pendiente"}</td><td><button className="superadmin-row-button" type="button" disabled={busy} onClick={() => setEditing(m)}>Cambiar acceso</button></td></tr>)}</DataTable></EmptyOr></>}
    <Dialog open={inviting || Boolean(editing)} onClose={() => { if (!busy) { setInviting(false); setEditing(null); } }} eyebrow="EQUIPO DE CAMPAÑA" title={editing ? "Cambiar o retirar acceso" : "Agregar usuario a la campaña"}>
      <form className="superadmin-form" onSubmit={e => void submit(e)}>
        <p>{text(campaign?.name)} · {text(campaign?.municipality_code)}</p>
        {!editing && <><Field label="Nombre completo"><input name="display_name" required maxLength={150} /></Field><Field label="Correo personal de acceso"><input name="email" type="email" required /></Field><p>Si es nuevo, recibirá una invitación para crear su contraseña. Si ya tiene cuenta, se asignará a esta campaña conservando su contraseña.</p></>}
        {editing && <p>{text(users.get(String(editing.user_id))?.email, text(editing.user_id))}</p>}
        <Field label="Permisos en esta campaña"><select key={text(editing?.user_id, "new")} name="member_role" defaultValue={text(editing?.member_role, roles[0])}>{roles.map(r => <option key={r} value={r}>{campaignRoleNames[r]}</option>)}{editing && <option value="remove">Retirar acceso a esta campaña</option>}</select></Field>
        <p>Retirar acceso conserva los datos de la campaña y los accesos a otros municipios. Para retirar al último administrador, asigna primero a su reemplazo.</p>
        <Field label="Motivo del cambio"><textarea name="reason" required minLength={3} maxLength={1000} /></Field>
        <button className="superadmin-primary" type="submit" disabled={busy}>{busy ? "Guardando…" : "Guardar acceso"}</button>
      </form>
    </Dialog>
  </Panel>;
}

function UsersModule({ snapshot, action, busy }: ActionModuleProps) {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<Record<
    string,
    unknown
  > | null>(null);
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const scopeType = String(form.scope_type);
    const permissionsByRole: Record<string, string[]> = {
      data_ops: ["snapshot:read", "data:preview", "pulse:draft"],
      qa: [
        "snapshot:read",
        "data:approve",
        "data:publish",
        "data:rollback",
        "pulse:approve",
        "qa:write",
      ],
      support: ["snapshot:read", "support:open", "support:close"],
      commercial_ops: ["snapshot:read", "contracts:write", "campaigns:write"],
      rtd_ops: ["snapshot:read", "rtd:read"],
    };
    const completed = await action("invite_user", {
      email: form.email,
      display_name: form.display_name,
      platform_role: form.platform_role,
      permissions: permissionsByRole[String(form.platform_role)] ?? [],
      scope: {
        country_code: "GT",
        department_code:
          scopeType === "DEPARTMENT" ? form.department_code : null,
        municipality_code:
          scopeType === "MUNICIPALITY" ? form.municipality_code : null,
      },
      reason: form.reason,
    });
    if (completed) setInviteOpen(false);
  }
  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedUser) return;
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const completed = await action("set_user_status", {
      user_id: selectedUser.id,
      is_active: String(form.is_active) === "true",
      reason: form.reason,
    });
    if (completed) setSelectedUser(null);
  }
  const departmentOptions = Array.from(
    new Map(
      snapshot.municipalities.map((item) => [
        item.department_code,
        item.department_name,
      ]),
    ).entries(),
  );
  return (
    <>
      <CampaignMembersPanel snapshot={snapshot} action={action} busy={busy} />
      <Panel
        eyebrow="CUENTAS ADMINISTRATIVAS"
        title="Personas del equipo RADAR"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setInviteOpen(true)}
          >
            + Invitar al equipo
          </button>
        }
      >
        <EmptyOr
          rows={snapshot.users.filter(user => user.platform_role)}
          empty="Tu rol no permite listar identidades o todavía no hay usuarios."
        >
          <DataTable
            headers={[
              "Usuario",
              "Rol",
              "Verificación en dos pasos",
              "Último acceso",
              "Estado",
              "",
            ]}
          >
            {snapshot.users.filter(user => user.platform_role).map((user) => (
              <tr key={text(user.id)}>
                <td>
                  <strong>{text(user.email, "Identidad restringida")}</strong>
                  <small>
                    {text(user.display_name, "Cuenta administrativa")}
                  </small>
                </td>
                <td>{statusLabel(user.platform_role)}</td>
                <td>
                  <Status
                    value={user.mfa_enrolled ? "Activada" : "Verificación en dos pasos pendiente"}
                  />
                </td>
                <td>{date(user.last_sign_in_at)}</td>
                <td>
                  <Status value={user.banned_until ? "SUSPENDIDO" : "ACTIVE"} />
                </td>
                <td>
                  <button
                    className="superadmin-row-button"
                    type="button"
                    onClick={() => setSelectedUser(user)}
                  >
                    Administrar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        eyebrow="ACCESO CON ALCANCE"
        title="Invitar a una persona"
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void invite(event)}
        >
          <Step
            number="1"
            title="Persona y función"
            detail="Los permisos se asignan desde el rol; no se escriben manualmente."
          />
          <Field label="Nombre">
            <input name="display_name" required placeholder="Nombre completo" />
          </Field>
          <Field label="Correo">
            <input
              name="email"
              type="email"
              required
              placeholder="persona@organizacion.com"
            />
          </Field>
          <Field label="Función">
            <select name="platform_role" defaultValue="data_ops">
              <option value="data_ops">Operación de datos</option>
              <option value="qa">Control de calidad</option>
              <option value="support">Soporte</option>
              <option value="commercial_ops">Operación comercial</option>
              <option value="rtd_ops">Operación RTD</option>
            </select>
          </Field>
          <Step
            number="2"
            title="Territorio autorizado"
            detail="La pertenencia y el alcance se vuelven a verificar en el servidor."
          />
          <Field label="Tipo de alcance">
            <select name="scope_type" defaultValue="MUNICIPALITY">
              <option value="MUNICIPALITY">Un municipio</option>
              <option value="DEPARTMENT">Un departamento</option>
              <option value="NATIONAL">Nacional</option>
            </select>
          </Field>
          <div className="superadmin-form-grid">
            <Field label="Municipio">
              <select name="municipality_code" defaultValue="">
                <option value="">No aplica</option>
                {snapshot.municipalities.map((item) => (
                  <option
                    key={item.municipality_code}
                    value={item.municipality_code}
                  >
                    {item.municipality_name} · {item.department_name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Departamento">
              <select name="department_code" defaultValue="">
                <option value="">No aplica</option>
                {departmentOptions.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Motivo">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Responsabilidad asignada y autorización"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Enviar invitación"
            onCancel={() => setInviteOpen(false)}
          />
        </form>
      </Dialog>
      <Dialog
        open={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        eyebrow="CONTROL DE SESIONES"
        title={text(selectedUser?.email, "Administrar usuario")}
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void changeStatus(event)}
        >
          <InlineNotice>
            Suspender bloquea la cuenta, desactiva sus alcances y revoca las
            sesiones existentes.
          </InlineNotice>
          <Field label="Acción">
            <select name="is_active" defaultValue="false">
              <option value="false">Suspender y revocar acceso</option>
              <option value="true">Reactivar cuenta</option>
            </select>
          </Field>
          <Field label="Motivo obligatorio">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Explicá por qué se modifica el acceso"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Confirmar cambio"
            onCancel={() => setSelectedUser(null)}
          />
        </form>
      </Dialog>
    </>
  );
}

function DataVaultModule({ snapshot, action, busy }: ActionModuleProps) {
  const [dialog, setDialog] = useState(false);
  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const completed = await action("register_source", {
      ...form,
      lineage: { method: form.method, notes: form.lineage_notes },
    });
    if (completed) setDialog(false);
  }
  return (
    <>
      <Panel
        eyebrow="17 GRUPOS DE INFORMACIÓN"
        title="Cobertura, procedencia y validación"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setDialog(true)}
          >
            + Registrar fuente
          </button>
        }
      >
        <DataTable
          headers={[
            "Capa",
            "Dominio",
            "Cobertura",
            "Estados de fuente",
            "Última actualización",
          ]}
        >
          {snapshot.layers.map((layer) => (
            <tr key={layer.layer_id}>
              <td>
                <strong>
                  {layer.layer_order.toString().padStart(2, "0")} ·{" "}
                  {layer.label}
                </strong>
                <small>{layer.layer_id}</small>
              </td>
              <td>{layer.domain}</td>
              <td>
                <Progress
                  value={layer.municipalities_present}
                  max={340}
                  label={`${number(layer.municipalities_present)}/340`}
                />
              </td>
              <td>
                <div className="superadmin-tags">
                  {Object.entries(layer.status_counts).map(([key, count]) => (
                    <span key={key}>
                      {statusLabel(key)} · {number(count)}
                    </span>
                  ))}
                </div>
              </td>
              <td>{date(layer.last_updated)}</td>
            </tr>
          ))}
        </DataTable>
      </Panel>
      <Panel eyebrow="REGISTRO DE FUENTES" title="Fuentes incorporadas">
        <EmptyOr
          rows={snapshot.sources}
          empty="No hay fuentes registradas todavía en el control nacional."
        >
          <DataTable
            headers={["Fuente", "Capa", "Período", "Escala", "Validación"]}
          >
            {snapshot.sources.map((source) => (
              <tr key={text(source.source_id)}>
                <td>
                  <strong>{text(source.source_label)}</strong>
                  <small>{text(source.source_id)}</small>
                </td>
                <td>{text(source.layer_id)}</td>
                <td>{text(source.source_period)}</td>
                <td>{statusLabel(source.territorial_scale)}</td>
                <td>
                  <Status value={source.validation_status} />
                </td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        eyebrow="TRAZABILIDAD DE DATOS"
        title="Registrar una fuente"
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void register(event)}
        >
          <Step
            number="1"
            title="Identificá la fuente"
            detail="La procedencia queda unida a cada publicación y versión."
          />
          <Field label="Institución o fuente">
            <input
              name="source_label"
              required
              placeholder="Ej. Tribunal Supremo Electoral"
            />
          </Field>
          <Field label="Identificador de fuente">
            <input
              name="source_id"
              required
              placeholder="Ej. TSE-2023-CENTROS"
            />
          </Field>
          <Field label="Enlace oficial">
            <input name="source_url" type="url" placeholder="https://..." />
          </Field>
          <Step
            number="2"
            title="Clasificá el universo"
            detail="Período, escala y capa no se mezclan entre sí."
          />
          <Field label="Capa">
            <select name="layer_id" required defaultValue="">
              <option value="" disabled>
                Seleccionar capa canónica
              </option>
              {snapshot.layers.map((layer) => (
                <option key={layer.layer_id} value={layer.layer_id}>
                  {layer.layer_order}. {layer.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="superadmin-form-grid">
            <Field label="Período">
              <input name="source_period" required placeholder="2023" />
            </Field>
            <Field label="Escala">
              <select name="territorial_scale" defaultValue="MUNICIPALITY">
                <option value="MUNICIPALITY">Municipal</option>
                <option value="DEPARTMENT">Departamental</option>
                <option value="NATIONAL">Nacional</option>
              </select>
            </Field>
          </div>
          <Field label="Método de obtención">
            <select name="method" defaultValue="OFFICIAL_DOWNLOAD">
              <option value="OFFICIAL_DOWNLOAD">Descarga oficial</option>
              <option value="PUBLIC_INFORMATION_REQUEST">
                Solicitud de información pública
              </option>
              <option value="CONTROLLED_MANUAL_EXTRACTION">
                Extracción manual controlada
              </option>
            </select>
          </Field>
          <Field label="Notas de linaje">
            <textarea
              name="lineage_notes"
              rows={3}
              placeholder="Ruta, hoja o tratamiento aplicado"
            />
          </Field>
          <input type="hidden" name="validation_status" value="REGISTERED" />
          <Field label="Motivo">
            <textarea
              name="reason"
              rows={2}
              required
              placeholder="Por qué se incorpora esta fuente"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Registrar fuente"
            onCancel={() => setDialog(false)}
          />
        </form>
      </Dialog>
    </>
  );
}

function PublicationModule({ snapshot, action, busy }: ActionModuleProps) {
  const [uploadOpen, setUploadOpen] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<Record<
    string,
    unknown
  > | null>(null);
  return (
    <>
      <div className="superadmin-workflow" aria-label="Flujo de publicación">
        <span className="is-current">
          <b>1</b>Cargar
        </span>
        <i />
        <span>
          <b>2</b>Prevalidar
        </span>
        <i />
        <span>
          <b>3</b>Revisar
        </span>
        <i />
        <span>
          <b>4</b>Aprobar
        </span>
        <i />
        <span>
          <b>5</b>Publicar
        </span>
      </div>
      <Panel
        eyebrow="LOTES VERSIONADOS"
        title="Publicaciones y vistas previas"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setUploadOpen(true)}
          >
            + Nueva carga
          </button>
        }
      >
        <EmptyOr
          rows={snapshot.publication_batches}
          empty="No hay lotes de publicación en QA."
        >
          <DataTable
            headers={[
              "Dataset",
              "Alcance",
              "Fuente",
              "Filas",
              "Bloqueos",
              "Estado",
              "",
            ]}
          >
            {snapshot.publication_batches.map((batch) => (
              <tr key={text(batch.id)}>
                <td>
                  <strong>{text(batch.dataset_key)}</strong>
                  <small>{text(batch.layer_id)}</small>
                </td>
                <td>
                  {statusLabel(batch.scope_type)} ·{" "}
                  {batch.municipality_code
                    ? municipalityLabel(snapshot, batch.municipality_code)
                    : text(batch.department_code, "Guatemala")}
                </td>
                <td>
                  {text(batch.source_label, text(batch.source_id))}
                  <small>{text(batch.source_period)}</small>
                </td>
                <td>{number(batch.row_count)}</td>
                <td>
                  <Status
                    value={
                      Number(batch.blocking_issues)
                        ? `${number(batch.blocking_issues)} bloqueos`
                        : "Sin bloqueos"
                    }
                  />
                </td>
                <td>
                  <Status value={batch.state} />
                </td>
                <td>
                  <button
                    className="superadmin-row-button"
                    type="button"
                    onClick={() => setSelectedBatch(batch)}
                  >
                    Revisar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      {snapshot.publication_issues.length ? (
        <Panel
          eyebrow="DIFERENCIAS Y ERRORES"
          title="Hallazgos de la prevalidación"
        >
          <DataTable
            headers={["Severidad", "Código", "Fila o campo", "Detalle"]}
          >
            {snapshot.publication_issues.map((issue) => (
              <tr key={text(issue.id)}>
                <td>
                  <Status value={issue.severity} />
                </td>
                <td>{text(issue.issue_code)}</td>
                <td>{text(issue.row_reference, text(issue.field_name))}</td>
                <td>{text(issue.message)}</td>
              </tr>
            ))}
          </DataTable>
        </Panel>
      ) : null}
      <Dialog
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        eyebrow="PASO 1 DE 5"
        title="Cargar y prevalidar datos"
        wide
      >
        <PublicationUpload
          snapshot={snapshot}
          busy={busy}
          onUploaded={async () => {
            setUploadOpen(false);
            await action("snapshot", {});
          }}
          onCancel={() => setUploadOpen(false)}
        />
      </Dialog>
      <Dialog
        open={Boolean(selectedBatch)}
        onClose={() => setSelectedBatch(null)}
        eyebrow="CONTROL DE PUBLICACIÓN"
        title={text(selectedBatch?.dataset_key, "Revisar lote")}
      >
        <BatchReview
          batch={selectedBatch}
          busy={busy}
          action={action}
          onClose={() => setSelectedBatch(null)}
        />
      </Dialog>
    </>
  );
}

function PublicationUpload({
  snapshot,
  busy,
  onUploaded,
  onCancel,
}: {
  snapshot: AdminSnapshot;
  busy: boolean;
  onUploaded: () => Promise<void>;
  onCancel: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [scope, setScope] = useState("MUNICIPALITY");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size)
      return setMessage("Seleccioná un archivo CSV o JSON.");
    const input = Object.fromEntries(
      Array.from(data.entries())
        .filter(([key]) => key !== "file")
        .map(([key, value]) => [key, String(value).trim() || null]),
    );
    if (scope === "NATIONAL") {
      input.department_code = null;
      input.municipality_code = null;
    }
    if (scope === "DEPARTMENT") input.municipality_code = null;
    if (scope === "MUNICIPALITY")
      input.department_code = String(input.municipality_code ?? "").slice(0, 2);
    setUploading(true);
    setMessage(null);
    try {
      const result = await uploadPublicationPreview(file, input);
      setMessage(
        `Vista previa creada: ${text(result.blocking_issues, "0")} bloqueos.`,
      );
      await onUploaded();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo crear la vista previa.",
      );
    } finally {
      setUploading(false);
    }
  }
  const departments = Array.from(
    new Map(
      snapshot.municipalities.map((item) => [
        item.department_code,
        item.department_name,
      ]),
    ).entries(),
  );
  return (
    <form className="superadmin-form" onSubmit={(event) => void submit(event)}>
      <Step
        number="1"
        title="Archivo y contenido"
        detail="El original se conserva versionado; nunca sobrescribe producción."
      />
      <Field label="Archivo">
        <input
          name="file"
          type="file"
          accept=".csv,.json,text/csv,application/json"
          required
        />
      </Field>
      <div className="superadmin-form-grid">
        <Field label="Conjunto de datos">
          <select name="dataset_key" defaultValue="municipality_layers">
            <option value="municipality_layers">Capas municipales</option>
            <option value="electoral_results">Resultados electorales</option>
            <option value="pulse_measurements">Pulso Electoral</option>
            <option value="rtd_reference">Referencia RTD</option>
          </select>
        </Field>
        <Field label="Capa canónica">
          <select name="layer_id" defaultValue="">
            <option value="">No aplica</option>
            {snapshot.layers.map((layer) => (
              <option key={layer.layer_id} value={layer.layer_id}>
                {layer.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Step
        number="2"
        title="Alcance exacto"
        detail="La publicación solo podrá llegar al territorio seleccionado."
      />
      <Field label="Alcance">
        <select
          name="scope_type"
          value={scope}
          onChange={(event) => setScope(event.target.value)}
        >
          <option value="MUNICIPALITY">Municipal</option>
          <option value="DEPARTMENT">Departamental</option>
          <option value="NATIONAL">Nacional · Guatemala</option>
        </select>
      </Field>
      {scope === "MUNICIPALITY" ? (
        <Field label="Municipio">
          <select name="municipality_code" required defaultValue="">
            <option value="" disabled>
              Seleccionar municipio
            </option>
            {snapshot.municipalities.map((item) => (
              <option
                key={item.municipality_code}
                value={item.municipality_code}
              >
                {item.municipality_name} · {item.department_name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {scope === "DEPARTMENT" ? (
        <Field label="Departamento">
          <select name="department_code" required defaultValue="">
            <option value="" disabled>
              Seleccionar departamento
            </option>
            {departments.map(([code, name]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Step
        number="3"
        title="Procedencia"
        detail="Fuente y período acompañan la versión publicada."
      />
      <div className="superadmin-form-grid">
        <Field label="Fuente registrada">
          <select name="source_id" required defaultValue="">
            <option value="" disabled>
              Seleccionar fuente
            </option>
            {snapshot.sources.map((source) => (
              <option
                key={text(source.source_id)}
                value={text(source.source_id)}
              >
                {text(source.source_label)} · {text(source.source_period)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Período">
          <input name="source_period" required placeholder="2023" />
        </Field>
      </div>
      <Field label="Nombre de fuente">
        <input name="source_label" required placeholder="Fuente oficial" />
      </Field>
      <Field label="Motivo">
        <textarea
          name="reason"
          rows={2}
          required
          placeholder="Propósito de la carga y responsable"
        />
      </Field>
      {message ? <InlineNotice>{message}</InlineNotice> : null}
      <DialogActions
        busy={busy || uploading}
        label={
          uploading ? "Calculando vista previa…" : "Cargar y crear vista previa"
        }
        onCancel={onCancel}
      />
    </form>
  );
}

function BatchReview({
  batch,
  busy,
  action,
  onClose,
}: {
  batch: Record<string, unknown> | null;
  busy: boolean;
  action: Action;
  onClose: () => void;
}) {
  if (!batch) return null;
  const state = String(batch.state ?? "");
  const next =
    state === "PREVALIDATED"
      ? "APPROVED"
      : state === "APPROVED"
        ? "PUBLISHED"
        : state === "PUBLISHED"
          ? "ROLLED_BACK"
          : "PREVALIDATED";
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const completed = await action("transition_publication", {
      batch_id: batch?.id,
      target_state: next,
      reason: form.reason,
    });
    if (completed) onClose();
  }
  return (
    <form className="superadmin-form" onSubmit={(event) => void submit(event)}>
      <div className="superadmin-review-card">
        <span>
          <small>Estado actual</small>
          <Status value={state} />
        </span>
        <span>
          <small>Filas</small>
          <strong>{number(batch.row_count)}</strong>
        </span>
        <span>
          <small>Bloqueos</small>
          <strong>{number(batch.blocking_issues)}</strong>
        </span>
      </div>
      <InlineNotice>
        {Number(batch.blocking_issues)
          ? "Este lote no puede avanzar mientras existan bloqueos."
          : `La siguiente transición disponible es: ${statusLabel(next)}.`}
      </InlineNotice>
      <Field label="Motivo de la decisión">
        <textarea
          name="reason"
          rows={3}
          required
          placeholder="Resultado de la revisión y responsable"
        />
      </Field>
      <DialogActions
        busy={busy}
        label={statusLabel(next)}
        onCancel={onClose}
        disabled={Number(batch.blocking_issues) > 0}
      />
    </form>
  );
}

function CampaignVaultModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return (
    <>
      <div className="superadmin-privacy">
        <span>▣</span>
        <div>
          <strong>Vista de salud, no de contenido privado</strong>
          <p>
            El operador ve conteos y alertas. El padrón, DPI, CRM y documentos
            permanecen cerrados.
          </p>
        </div>
      </div>
      <Panel eyebrow="SALUD POR CAMPAÑA" title="Campaign Vault">
        <EmptyOr
          rows={snapshot.campaign_health}
          empty="No hay campañas con métricas operativas disponibles."
        >
          <DataTable
            headers={[
              "Municipio",
              "Electores",
              "Contactos",
              "Actividades",
              "Fiscales",
              "RTD",
              "Incidentes",
            ]}
          >
            {snapshot.campaign_health.map((item) => (
              <tr key={text(item.campaign_id)}>
                <td>
                  <strong>
                    {municipalityLabel(snapshot, item.municipality_code)}
                  </strong>
                  <small>{text(item.municipality_code)}</small>
                </td>
                <td>{number(item.voter_records)}</td>
                <td>{number(item.contacts)}</td>
                <td>{number(item.activities)}</td>
                <td>{number(item.fiscales)}</td>
                <td>{number(item.rtd_records)}</td>
                <td>
                  <Status
                    value={
                      Number(item.open_incidents)
                        ? `${number(item.open_incidents)} alertas`
                        : "Sin alertas"
                    }
                  />
                </td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
    </>
  );
}

function PulseModule({ snapshot, action, busy }: ActionModuleProps) {
  const [dialog, setDialog] = useState(false);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(
    null,
  );
  const [election, setElection] = useState("ALCALDIA");
  const [resultRows, setResultRows] = useState([1, 2, 3]);
  const [nextResultRow, setNextResultRow] = useState(4);
  const scope =
    election === "ALCALDIA"
      ? "MUNICIPALITY"
      : election === "DIP_DIST"
        ? "DEPARTMENT"
        : "NATIONAL";
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const measurement = {
      folio: form.folio,
      election_type: election,
      scope_type: scope,
      country_code: "GT",
      municipality_code:
        scope === "MUNICIPALITY" ? form.municipality_code : null,
      department_code: scope === "DEPARTMENT" ? form.department_code : null,
      field_start: form.field_start,
      field_end: form.field_end,
      sample_size: Number(form.sample_size),
      scope_label: form.scope_label,
      methodology: form.methodology,
      technical_sheet: {
        confidence: form.confidence,
        margin_error: form.margin_error,
      },
      source_id: form.source_id,
      source_label: form.source_label,
      version: 1,
    };
    const results = resultRows
      .map((index) => ({
        option_code: `O${index}`,
        candidate_name: form[`candidate_${index}`],
        value: Number(form[`value_${index}`]),
      }))
      .filter((item) => item.candidate_name);
    const completed = await action("save_pulse_draft", {
      measurement,
      results,
      reason: form.reason,
    });
    if (completed) setDialog(false);
  }
  async function transition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = Object.fromEntries(
      new FormData(event.currentTarget).entries(),
    );
    const completed = await action("transition_pulse", {
      measurement_id: selected.id,
      target_status: form.target_status,
      preview_hash: selected.preview_hash,
      reason: form.reason,
    });
    if (completed) setSelected(null);
  }
  const departments = Array.from(
    new Map(
      snapshot.municipalities.map((item) => [
        item.department_code,
        item.department_name,
      ]),
    ).entries(),
  );
  return (
    <>
      <div className="superadmin-scope-rules">
        <div>
          <span>01</span>
          <strong>Municipal</strong>
          <small>Alcaldía · mismo municipio</small>
        </div>
        <div>
          <span>02</span>
          <strong>Departamental</strong>
          <small>Diputación distrital · mismo departamento</small>
        </div>
        <div>
          <span>03</span>
          <strong>Nacional</strong>
          <small>Presidencia, listado nacional y Parlacen · GT</small>
        </div>
      </div>
      <Panel
        eyebrow="MEDICIONES VERSIONADAS"
        title="Encuestas y publicaciones"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setDialog(true)}
          >
            + Nueva encuesta
          </button>
        }
      >
        <EmptyOr
          rows={snapshot.pulse_measurements}
          empty="No existen mediciones QA publicables."
        >
          <DataTable
            headers={[
              "Folio",
              "Elección",
              "Alcance",
              "Trabajo de campo",
              "Muestra",
              "Estado",
              "",
            ]}
          >
            {snapshot.pulse_measurements.map((item) => (
              <tr key={text(item.id)}>
                <td>
                  <strong>{text(item.folio)}</strong>
                  <small>Versión {text(item.version)}</small>
                </td>
                <td>{statusLabel(item.election_type)}</td>
                <td>
                  {statusLabel(item.scope_type)} ·{" "}
                  {item.municipality_code
                    ? municipalityLabel(snapshot, item.municipality_code)
                    : text(item.department_code, "Guatemala")}
                </td>
                <td>
                  {text(item.field_start)} → {text(item.field_end)}
                </td>
                <td>{number(item.sample_size)}</td>
                <td>
                  <Status value={item.status} />
                </td>
                <td>
                  <button
                    className="superadmin-row-button"
                    type="button"
                    onClick={() => setSelected(item)}
                  >
                    Revisar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        eyebrow="BORRADOR VERSIONADO"
        title="Cargar Pulso Electoral"
        wide
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void save(event)}
        >
          <Step
            number="1"
            title="Elección y alcance"
            detail="El alcance se determina automáticamente según la elección."
          />
          <div className="superadmin-form-grid">
            <Field label="Elección">
              <select
                name="election_type"
                value={election}
                onChange={(event) => setElection(event.target.value)}
              >
                <option value="ALCALDIA">Alcaldía</option>
                <option value="DIP_DIST">Diputación distrital</option>
                <option value="PRESIDENTE">Presidencia</option>
                <option value="DIP_NAC">Listado nacional</option>
                <option value="PARLACEN">Parlacen</option>
              </select>
            </Field>
            <Field label="Folio">
              <input name="folio" required placeholder="PULSO-0509-001" />
            </Field>
          </div>
          {scope === "MUNICIPALITY" ? (
            <Field label="Municipio">
              <select name="municipality_code" required defaultValue="">
                <option value="" disabled>
                  Seleccionar municipio
                </option>
                {snapshot.municipalities.map((item) => (
                  <option
                    key={item.municipality_code}
                    value={item.municipality_code}
                  >
                    {item.municipality_name} · {item.department_name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {scope === "DEPARTMENT" ? (
            <Field label="Departamento">
              <select name="department_code" required defaultValue="">
                <option value="" disabled>
                  Seleccionar departamento
                </option>
                {departments.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          <Field label="Nombre visible del alcance">
            <input
              name="scope_label"
              required
              placeholder="Ej. Municipio de San José"
            />
          </Field>
          <Step
            number="2"
            title="Ficha técnica"
            detail="No se puede publicar sin fechas, muestra, metodología y fuente."
          />
          <div className="superadmin-form-grid">
            <Field label="Inicio de campo">
              <input name="field_start" type="date" required />
            </Field>
            <Field label="Final de campo">
              <input name="field_end" type="date" required />
            </Field>
          </div>
          <div className="superadmin-form-grid superadmin-form-grid--three">
            <Field label="Muestra">
              <input name="sample_size" type="number" min="1" required />
            </Field>
            <Field label="Confianza">
              <input name="confidence" placeholder="95%" required />
            </Field>
            <Field label="Margen de error">
              <input name="margin_error" placeholder="±4.9%" required />
            </Field>
          </div>
          <Field label="Metodología">
            <textarea
              name="methodology"
              rows={3}
              required
              placeholder="Diseño, levantamiento y ponderación"
            />
          </Field>
          <div className="superadmin-form-grid">
            <Field label="Código de fuente">
              <input name="source_id" required placeholder="RADAR-PULSO-001" />
            </Field>
            <Field label="Fuente">
              <input
                name="source_label"
                required
                placeholder="Firma o equipo responsable"
              />
            </Field>
          </div>
          <Step
            number="3"
            title="Resultados"
            detail="Se guardan exactamente estos valores; el cliente no los recalcula."
          />
          {resultRows.map((index) => (
            <div className="superadmin-result-row" key={index}>
              <input
                name={`candidate_${index}`}
                placeholder={`Opción o candidatura ${index}`}
                aria-label={`Candidatura u opción ${index}`}
                required
              />
              <input
                name={`value_${index}`}
                type="number"
                step="0.01"
                min="0"
                max="100"
                aria-label={`Porcentaje de la opción ${index}`}
                placeholder="%"
                required
              />
              <button type="button" className="superadmin-row-button" disabled={resultRows.length <= 2} aria-label={`Quitar opción ${index}`} onClick={() => setResultRows((rows) => rows.filter((row) => row !== index))}>Quitar</button>
            </div>
          ))}
          <button type="button" className="superadmin-row-button" onClick={() => { setResultRows((rows) => [...rows, nextResultRow]); setNextResultRow((row) => row + 1); }}>+ Agregar candidatura u opción</button>
          <p className="superadmin-help">Incluí todas las candidaturas medidas y, si la encuesta las incluye, opciones como indecisos o ninguno. Los porcentajes deben corresponder a la misma pregunta.</p>
          <Field label="Motivo">
            <textarea
              name="reason"
              rows={2}
              required
              placeholder="Responsable y propósito de la carga"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Guardar borrador"
            onCancel={() => setDialog(false)}
          />
        </form>
      </Dialog>
      <Dialog
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        eyebrow="PREVIEW OBLIGATORIO"
        title={text(selected?.folio, "Revisar encuesta")}
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void transition(event)}
        >
          <InlineNotice>
            La publicación exige vista previa, validación y aprobación. Una
            versión publicada es inmutable.
          </InlineNotice>
          <Field label="Siguiente estado">
            <select name="target_status" defaultValue="PREVALIDADA">
              <option value="PREVALIDADA">Prevalidar</option>
              <option value="APROBADA">Aprobar</option>
              <option value="PUBLICADA">Publicar</option>
            </select>
          </Field>
          <Field label="Motivo">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Resultado de la revisión"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Confirmar transición"
            onCancel={() => setSelected(null)}
          />
        </form>
      </Dialog>
    </>
  );
}

function RtdModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return (
    <>
      <div className="superadmin-kpis superadmin-kpis--compact">
        <Kpi
          label="Campañas monitoreadas"
          value={number(snapshot.rtd.length)}
          note="Con recepción RTD registrada"
          tone="petrol"
        />
        <Kpi
          label="Actas recibidas"
          value={number(
            snapshot.rtd_monitoring.reduce(
              (sum, item) => sum + Number(item.actas_received ?? 0),
              0,
            ),
          )}
          note="Cinco elecciones controladas"
          tone="purple"
        />
        <Kpi
          label="JRV retrasadas"
          value={number(
            snapshot.rtd_monitoring.reduce(
              (sum, item) => sum + Number(item.delayed_jrv ?? 0),
              0,
            ),
          )}
          note="Según el último corte"
          tone="graphite"
        />
      </div>
      <Panel eyebrow="MONITOREO AGREGADO" title="RTD Día D">
        <p className="superadmin-help">
          Este panel muestra el avance de recepción y los incidentes por campaña.
          Los resultados por candidato y la revisión de imágenes de actas aún no están disponibles aquí.
        </p>
        <EmptyOr
          rows={snapshot.rtd}
          empty="No hay campañas RTD reales con recepción registrada."
        >
          <DataTable
            headers={[
              "Municipio",
              "Fiscales",
              "Centros",
              "JRV",
              "Borradores",
              "Confirmadas",
              "Alertas",
              "Actualización",
            ]}
          >
            {snapshot.rtd.map((item) => (
              <tr key={text(item.campaign_id)}>
                <td>
                  <strong>
                    {municipalityLabel(snapshot, item.municipality_code)}
                  </strong>
                  <small>{text(item.municipality_code)}</small>
                </td>
                <td>{number(item.fiscales)}</td>
                <td>{number(item.centers_received)}</td>
                <td>{number(item.jrv_received)}</td>
                <td>{number(item.drafts)}</td>
                <td>{number(item.confirmed)}</td>
                <td>
                  <Status
                    value={
                      Number(item.open_incidents)
                        ? `${number(item.open_incidents)} alertas`
                        : "Sin alertas"
                    }
                  />
                </td>
                <td>{date(item.last_update)}</td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Panel eyebrow="CINCO ACTAS Y RETRASOS" title="Últimos cortes operativos">
        <EmptyOr
          rows={snapshot.rtd_monitoring}
          empty="No hay cortes agregados registrados."
        >
          <DataTable
            headers={[
              "Territorio",
              "Centros",
              "JRV",
              "Fiscales",
              "Esperadas",
              "Recibidas",
              "Con error",
              "Retrasos",
              "Corte",
            ]}
          >
            {snapshot.rtd_monitoring.map((item) => (
              <tr key={text(item.id)}>
                <td>
                  {item.municipality_code
                    ? municipalityLabel(snapshot, item.municipality_code)
                    : text(item.department_code, "Guatemala")}
                </td>
                <td>{number(item.centers_total)}</td>
                <td>{number(item.jrv_total)}</td>
                <td>{number(item.fiscales_assigned)}</td>
                <td>{number(item.actas_expected)}</td>
                <td>{number(item.actas_received)}</td>
                <td>{number(item.actas_with_error)}</td>
                <td>{number(item.delayed_jrv)}</td>
                <td>{date(item.snapshot_at)}</td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
    </>
  );
}

function QaModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return (
    <div className="superadmin-grid superadmin-grid--wide">
      <Panel eyebrow="PRUEBAS AUTOMATIZADAS" title="Ejecuciones QA">
        <EmptyOr
          rows={snapshot.qa_runs}
          empty="No hay ejecuciones QA registradas en la base."
        >
          {snapshot.qa_runs.map((run) => (
            <TimelineRow
              key={text(run.id)}
              title={`${text(run.suite)} · ${statusLabel(run.status)}`}
              detail={`${text(run.git_branch)} · ${text(run.git_sha).slice(0, 12)}`}
              meta={date(run.finished_at ?? run.started_at)}
            />
          ))}
        </EmptyOr>
      </Panel>
      <Panel eyebrow="VERSIONES QA" title="Despliegues">
        <EmptyOr
          rows={snapshot.deployments}
          empty="No hay despliegues administrativos registrados."
        >
          {snapshot.deployments.map((deployment) => (
            <TimelineRow
              key={text(deployment.id)}
              title={`${text(deployment.environment)} · ${statusLabel(deployment.status)}`}
              detail={`${text(deployment.version_label)} · ${text(deployment.git_sha).slice(0, 12)}`}
              meta={date(deployment.deployed_at ?? deployment.created_at)}
            />
          ))}
        </EmptyOr>
      </Panel>
    </div>
  );
}

function AuditModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return (
    <Panel eyebrow="REGISTRO INALTERABLE" title="Actividad administrativa">
      <EmptyOr
        rows={snapshot.audit}
        empty="No hay eventos administrativos todavía."
      >
        <DataTable
          headers={[
            "Fecha",
            "Actor",
            "Acción",
            "Objeto",
            "Territorio",
            "Motivo",
          ]}
        >
          {snapshot.audit.map((event) => (
            <tr key={text(event.id)}>
              <td>{date(event.created_at)}</td>
              <td>
                <strong>{statusLabel(event.actor_role)}</strong>
                <small>Identidad protegida</small>
              </td>
              <td>{statusLabel(event.action)}</td>
              <td>{statusLabel(event.entity_type)}</td>
              <td>
                {event.municipality_code
                  ? municipalityLabel(snapshot, event.municipality_code)
                  : text(event.department_code, "Guatemala")}
              </td>
              <td>{text(event.reason)}</td>
            </tr>
          ))}
        </DataTable>
      </EmptyOr>
    </Panel>
  );
}

function SupportModule({ snapshot, action, busy }: ActionModuleProps) {
  const [dialog, setDialog] = useState(false);
  async function open(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const completed = await action(
      "open_support_session",
      Object.fromEntries(new FormData(event.currentTarget).entries()),
    );
    if (completed) setDialog(false);
  }
  return (
    <>
      <div className="superadmin-privacy">
        <span>?</span>
        <div>
          <strong>Soporte conserva siempre su propia identidad</strong>
          <p>
            No existe “entrar como usuario”. Cada diagnóstico muestra un aviso,
            vence automáticamente y queda unido a un ticket.
          </p>
        </div>
      </div>
      <Panel
        eyebrow="SESIONES AUDITADAS"
        title="Diagnósticos de soporte"
        action={
          <button
            className="superadmin-primary"
            type="button"
            onClick={() => setDialog(true)}
          >
            + Abrir diagnóstico
          </button>
        }
      >
        <EmptyOr
          rows={snapshot.support}
          empty="No hay sesiones de soporte abiertas o históricas."
        >
          <DataTable
            headers={["Ticket", "Territorio", "Modo", "Estado", "Expira"]}
          >
            {snapshot.support.map((session) => (
              <tr key={text(session.id)}>
                <td>
                  <strong>{text(session.ticket_ref)}</strong>
                </td>
                <td>
                  {session.municipality_code
                    ? municipalityLabel(snapshot, session.municipality_code)
                    : "Campaña autorizada"}
                </td>
                <td>{statusLabel(session.access_mode)}</td>
                <td>
                  <Status value={session.status} />
                </td>
                <td>{date(session.expires_at)}</td>
              </tr>
            ))}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        eyebrow="ACCESO TEMPORAL"
        title="Abrir diagnóstico"
      >
        <form
          className="superadmin-form"
          onSubmit={(event) => void open(event)}
        >
          <Step
            number="1"
            title="Ticket y territorio"
            detail="La sesión solo podrá leer el contexto seleccionado."
          />
          <Field label="Ticket">
            <input name="ticket_ref" required placeholder="SOP-0509-001" />
          </Field>
          <Field label="Municipio">
            <select name="municipality_code" required defaultValue="">
              <option value="" disabled>
                Seleccionar municipio
              </option>
              {snapshot.municipalities.map((item) => (
                <option
                  key={item.municipality_code}
                  value={item.municipality_code}
                >
                  {item.municipality_name} · {item.department_name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Campaña">
            <select name="campaign_id" defaultValue="">
              <option value="">Diagnóstico municipal</option>
              {snapshot.campaigns.map((item) => (
                <option key={text(item.id)} value={text(item.id)}>
                  {text(item.name)} · {text(item.municipality_code)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Modo">
            <select name="access_mode" defaultValue="READ_ONLY">
              <option value="READ_ONLY">Solo lectura</option>
              <option value="MINIMAL_DIAGNOSTIC">Diagnóstico mínimo</option>
            </select>
          </Field>
          <Step
            number="2"
            title="Límite y justificación"
            detail="La duración máxima es de ocho horas."
          />
          <Field label="Caducidad">
            <input name="expires_at" type="datetime-local" required />
          </Field>
          <Field label="Motivo">
            <textarea
              name="reason"
              rows={3}
              required
              placeholder="Problema reportado y alcance autorizado"
            />
          </Field>
          <DialogActions
            busy={busy}
            label="Abrir diagnóstico"
            onCancel={() => setDialog(false)}
          />
        </form>
      </Dialog>
    </>
  );
}

function Kpi({
  label,
  value,
  note,
  tone,
}: {
  label: string;
  value: string;
  note: string;
  tone: string;
}) {
  return (
    <article className={`superadmin-kpi is-${tone}`}>
      <span />
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{note}</p>
      </div>
    </article>
  );
}
function Panel({
  eyebrow,
  title,
  action,
  children,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="superadmin-panel">
      <header>
        <div>
          <span>{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}
function MunicipalitySignal({
  municipality,
}: {
  municipality: AdminMunicipalityState;
}) {
  return (
    <article>
      <header>
        <code>{municipality.municipality_code}</code>
        <Status value={municipality.operational_state} />
      </header>
      <h3>{municipality.municipality_name}</h3>
      <p>{municipality.department_name}</p>
      <Progress
        value={municipality.canonical_layers_present}
        max={17}
        label={`${municipality.canonical_layers_present}/17 grupos`}
      />
      <dl>
        <div>
          <dt>Campañas</dt>
          <dd>{municipality.active_campaigns}</dd>
        </div>
        <div>
          <dt>Miembros</dt>
          <dd>{municipality.campaign_members}</dd>
        </div>
        <div>
          <dt>Contratos</dt>
          <dd>{municipality.protected_contracts}</dd>
        </div>
      </dl>
      <Link to={`/municipio/${municipality.municipality_code}`}>
        Abrir municipio ↗
      </Link>
    </article>
  );
}
function DataTable({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="superadmin-table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header, index) => (
              <th key={`${header}-${index}`}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
function Progress({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label: string;
}) {
  const width = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="superadmin-progress">
      <span>
        <i style={{ width: `${width}%` }} />
      </span>
      <small>{label}</small>
    </div>
  );
}
function Status({ value }: { value: unknown }) {
  const normalized = text(value).toLowerCase();
  const tone =
    /active|activo|ready|listo|published|publicad|approved|aprobad|confirmed|protected|protegido|sin alertas|sin bloqueos|aal2|passed/.test(
      normalized,
    )
      ? "good"
      : /error|block|bloque|suspend|reject|pendiente|alert|failed/.test(
            normalized,
          )
        ? "bad"
        : "neutral";
  return (
    <span className={`superadmin-status is-${tone}`}>{statusLabel(value)}</span>
  );
}
function EmptyOr({
  rows,
  empty,
  children,
}: {
  rows: unknown[];
  empty: string;
  children: ReactNode;
}) {
  return rows.length ? (
    <>{children}</>
  ) : (
    <div className="superadmin-empty">
      <span>○</span>
      <strong>Sin datos verificados</strong>
      <p>{empty}</p>
    </div>
  );
}
function TimelineRow({
  title,
  detail,
  meta,
}: {
  title: string;
  detail: string;
  meta: string;
}) {
  return (
    <div className="superadmin-timeline">
      <i />
      <div>
        <strong>{title}</strong>
        <p>{detail}</p>
      </div>
      <time>{meta}</time>
    </div>
  );
}
function Dialog({
  open,
  onClose,
  eyebrow,
  title,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  wide?: boolean;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="superadmin-dialog-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className={wide ? "superadmin-dialog is-wide" : "superadmin-dialog"}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <div>
            <span>{eyebrow}</span>
            <h2>{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar">
            ×
          </button>
        </header>
        <div className="superadmin-dialog-body">{children}</div>
      </section>
    </div>
  );
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="superadmin-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Step({
  number: index,
  title,
  detail,
}: {
  number: string;
  title: string;
  detail: string;
}) {
  return (
    <div className="superadmin-step">
      <span>{index}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}
function InlineNotice({ children }: { children: ReactNode }) {
  return (
    <div className="superadmin-inline-notice">
      <span>i</span>
      <p>{children}</p>
    </div>
  );
}
function DialogActions({
  busy,
  label,
  onCancel,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <footer className="superadmin-dialog-actions">
      <button type="button" onClick={onCancel}>
        Cancelar
      </button>
      <button type="submit" disabled={busy || disabled}>
        {busy ? "Procesando…" : label}
      </button>
    </footer>
  );
}
