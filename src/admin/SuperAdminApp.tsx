import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { signOutRadar } from "../data/radarAuth";
import { runAdminAction, uploadPublicationPreview, type AdminMunicipalityState, type AdminSnapshot } from "./radarAdminApi";

const sections = [
  ["resumen", "Resumen nacional", "RN"],
  ["municipios", "Municipios y campañas", "MC"],
  ["exclusividad", "Exclusividad comercial", "EX"],
  ["usuarios", "Usuarios y permisos", "UP"],
  ["data-vault", "Data Vault", "DV"],
  ["publicaciones", "Publicaciones", "PB"],
  ["campaign-vault", "Campaign Vault", "CV"],
  ["pulso", "Pulso Electoral", "PE"],
  ["rtd", "RTD Día D", "RT"],
  ["qa", "QA y despliegue", "QA"],
  ["auditoria", "Auditoría", "AU"],
  ["soporte", "Soporte seguro", "SS"],
] as const;

type SectionId = typeof sections[number][0];

const text = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const number = (value: unknown) => Number(value ?? 0).toLocaleString("es-GT");
const date = (value: unknown) => value ? new Intl.DateTimeFormat("es-GT", { dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value))) : "Sin actualización";

function statusLabel(value: unknown) {
  return text(value).replaceAll("_", " ");
}

export function SuperAdminApp({ snapshot, onRefresh }: { snapshot: AdminSnapshot; onRefresh: () => Promise<void> }) {
  const { section } = useParams();
  const active = (sections.some(([id]) => id === section) ? section : "resumen") as SectionId;
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const activeDefinition = sections.find(([id]) => id === active)!;
  const logo = `${import.meta.env.BASE_URL}brand/radar-electoral-logo-horizontal-oscuro-transparente.svg`;

  async function action<T>(operation: string, input: Record<string, unknown>) {
    setActionBusy(true);
    setActionMessage(null);
    try {
      await runAdminAction<T>(operation, input);
      setActionMessage("Operación registrada y auditada.");
      await onRefresh();
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "No se pudo completar la operación.");
    } finally {
      setActionBusy(false);
    }
  }

  async function logout() {
    await signOutRadar();
    navigate("/acceso?next=/admin", { replace: true });
  }

  return (
    <div className="superadmin-shell">
      <aside className={menuOpen ? "superadmin-sidebar is-open" : "superadmin-sidebar"}>
        <div className="superadmin-brand">
          <img src={logo} alt="RADAR Inteligencia Electoral" />
          <span>CONTROL-PLANE · GT</span>
        </div>
        <nav aria-label="Navegación del superadministrador">
          {sections.map(([id, label, icon]) => (
            <NavLink key={id} to={`/admin/${id}`} onClick={() => setMenuOpen(false)} className={() => active === id ? "active" : undefined}>
              <b aria-hidden="true">{icon}</b><span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="superadmin-identity">
          <span>{snapshot.operator_context.user_role.slice(0, 2).toUpperCase()}</span>
          <div><strong>{statusLabel(snapshot.operator_context.user_role)}</strong><small>MFA · sesión verificada</small></div>
          <button type="button" onClick={() => void logout()} aria-label="Cerrar sesión">↗</button>
        </div>
      </aside>

      <main className="superadmin-workspace">
        <header className="superadmin-topbar">
          <button className="superadmin-menu" type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Abrir navegación">☰</button>
          <div><span>RADAR</span><i>/</i><strong>{activeDefinition[1]}</strong></div>
          <div className="superadmin-top-actions">
            <span><i /> QA · control cerrado</span>
            <button type="button" onClick={() => void onRefresh()}>Actualizar</button>
          </div>
        </header>
        <div className="superadmin-content">
          <div className="superadmin-heading">
            <div><span>OPERACIÓN NACIONAL</span><h1>{activeDefinition[1]}</h1></div>
            <div className="superadmin-snapshot"><span>Lectura de sistema</span><strong>{date(snapshot.generated_at)}</strong><small>Sin contadores decorativos</small></div>
          </div>
          {actionMessage ? <div className="superadmin-action-message" role="status">{actionMessage}</div> : null}
          <SectionRouter active={active} snapshot={snapshot} action={action} busy={actionBusy} />
        </div>
      </main>
    </div>
  );
}

function SectionRouter({ active, snapshot, action, busy }: {
  active: SectionId; snapshot: AdminSnapshot;
  action: (operation: string, input: Record<string, unknown>) => Promise<void>;
  busy: boolean;
}) {
  if (active === "resumen") return <NationalSummary snapshot={snapshot} />;
  if (active === "municipios") return <MunicipalitiesModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "exclusividad") return <ExclusivityModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "usuarios") return <UsersModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "data-vault") return <DataVaultModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "publicaciones") return <PublicationModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "campaign-vault") return <CampaignVaultModule snapshot={snapshot} />;
  if (active === "pulso") return <PulseModule snapshot={snapshot} action={action} busy={busy} />;
  if (active === "rtd") return <RtdModule snapshot={snapshot} />;
  if (active === "qa") return <QaModule snapshot={snapshot} />;
  if (active === "auditoria") return <AuditModule snapshot={snapshot} />;
  return <SupportModule snapshot={snapshot} action={action} busy={busy} />;
}

function NationalSummary({ snapshot }: { snapshot: AdminSnapshot }) {
  const recentAudit = snapshot.audit.slice(0, 5);
  return (
    <>
      <div className="superadmin-kpis">
        <Kpi label="Municipios reales" value={number(snapshot.national.municipalities)} note={`${number(snapshot.national.departments)} departamentos`} tone="blue" />
        <Kpi label="17 capas presentes" value={number(snapshot.national.municipalities_with_17_layers)} note="Presencia; no equivale a validación" tone="violet" />
        <Kpi label="Campañas activas" value={number(snapshot.national.active_campaigns)} note="No incluye demo" tone="green" />
        <Kpi label="Contratos protegidos" value={number(snapshot.national.protected_contracts)} note="Exclusividad vigente" tone="amber" />
      </div>
      <div className="superadmin-grid superadmin-grid--wide">
        <Panel eyebrow="VERTICAL QA" title="Aislamiento 0509 + segundo municipio">
          <div className="superadmin-verticals">
            {snapshot.vertical_qa.map((municipality) => <MunicipalitySignal key={municipality.municipality_code} municipality={municipality} />)}
          </div>
        </Panel>
        <Panel eyebrow="CONTROL DE ACCESO" title="Contexto verificado">
          <DefinitionList entries={[
            ["Rol", statusLabel(snapshot.operator_context.user_role)],
            ["Permisos", snapshot.operator_context.permissions.join(", ") || "Sin permisos"],
            ["Alcances", number(snapshot.operator_context.scopes.length)],
            ["Contrato", snapshot.contract.context_fields.join(" + ")],
          ]} />
        </Panel>
      </div>
      <div className="superadmin-grid superadmin-grid--wide">
        <Panel eyebrow="DATA VAULT" title="17 capas canónicas">
          <div className="superadmin-layer-mini">
            {snapshot.layers.map((layer) => (
              <div key={layer.layer_id}><span>{layer.layer_order.toString().padStart(2, "0")}</span><strong>{layer.label}</strong><b>{layer.municipalities_present}/340</b></div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="ACTIVIDAD" title="Últimos eventos auditados">
          <EmptyOr rows={recentAudit} empty="Todavía no hay eventos administrativos.">
            {recentAudit.map((event) => <TimelineRow key={text(event.id)} title={statusLabel(event.action)} detail={`${text(event.entity_type)} · ${text(event.reason)}`} meta={date(event.created_at)} />)}
          </EmptyOr>
        </Panel>
      </div>
    </>
  );
}

function MunicipalitiesModule({ snapshot, action, busy }: ActionModuleProps) {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("ALL");
  const items = useMemo(() => snapshot.municipalities.filter((item) => {
    const haystack = `${item.municipality_code} ${item.municipality_name} ${item.department_name}`.toLowerCase();
    return (!query || haystack.includes(query.toLowerCase())) && (department === "ALL" || item.department_code === department);
  }), [snapshot.municipalities, query, department]);
  const departments = useMemo(() => Array.from(new Map(snapshot.municipalities.map((item) => [item.department_code, item.department_name])).entries()), [snapshot.municipalities]);
  return (
    <div className="superadmin-grid superadmin-grid--form"><Panel eyebrow="INVENTARIO REAL" title="340 municipios · una sola plataforma">
      <div className="superadmin-filters">
        <label><span>Buscar municipio</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, municipio o departamento" /></label>
        <label><span>Departamento</span><select value={department} onChange={(event) => setDepartment(event.target.value)}><option value="ALL">Todos</option>{departments.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select></label>
        <strong>{items.length} resultados</strong>
      </div>
      <DataTable headers={["Código", "Municipio", "Capas", "Campañas", "Contrato", "Última actualización"]}>
        {items.map((item) => <tr key={item.municipality_code}>
          <td><code>{item.municipality_code}</code></td><td><strong>{item.municipality_name}</strong><small>{item.department_name}</small></td>
          <td>{item.canonical_layers_present}/17</td><td>{item.active_campaigns}</td>
          <td><Status value={item.operational_state} /></td><td>{date(item.data_updated_at)}</td>
        </tr>)}
      </DataTable>
    </Panel><Panel eyebrow="ALTA PARAMETRIZADA" title="Crear campaña protegida"><ActionForm busy={busy} submitLabel="Crear campaña" onSubmit={(form) => action("create_campaign", form)} fields={[
      ["municipality_code","Código municipal","0509"],["organization_id","UUID organización",""],["name","Nombre de campaña","San José 2027"],
      ["slug","Slug","san-jose-2027"],["status","Estado","PAUSED"],["reason","Motivo obligatorio","Alta posterior a reserva contractual"],
    ]} /><p className="superadmin-help">La base exige una reserva contractual vigente de la misma organización antes de crear la campaña.</p></Panel></div>
  );
}

function ExclusivityModule({ snapshot, action, busy }: ActionModuleProps) {
  return (
    <div className="superadmin-grid superadmin-grid--form">
      <Panel eyebrow="GARANTÍA DE BASE" title="Exclusividad por municipio y período">
        <EmptyOr rows={snapshot.contracts} empty="No hay contratos registrados en el control-plane QA.">
          <DataTable headers={["Contrato", "Municipio", "Vigencia", "Estado"]}>
            {snapshot.contracts.map((contract) => <tr key={text(contract.id)}><td><strong>{text(contract.contract_ref)}</strong></td><td>{text(contract.municipality_code)}</td><td>{text(contract.valid_from)} → {text(contract.valid_until, "abierto")}</td><td><Status value={contract.status} /></td></tr>)}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Panel eyebrow="OPERACIÓN AUDITADA" title="Reservar territorio">
        <ActionForm busy={busy} submitLabel="Crear reserva" onSubmit={(form) => action("reserve_contract", form)} fields={[
          ["municipality_code", "Código municipal", "0509"], ["organization_id", "UUID organización", ""],
          ["campaign_id", "UUID campaña (opcional)", ""], ["contract_ref", "Referencia contractual", "RADAR-2027-0509"],
          ["valid_from", "Inicio", "2026-09-18", "date"], ["valid_until", "Fin", "2027-12-31", "date"],
          ["status", "Estado", "RESERVED"], ["reason", "Motivo obligatorio", "Reserva comercial aprobada"],
        ]} />
        <p className="superadmin-help">Los períodos protegidos no pueden solaparse. Un conflicto se rechaza en PostgreSQL aunque la UI falle.</p>
      </Panel>
    </div>
  );
}

function UsersModule({ snapshot, action, busy }: ActionModuleProps) {
  return (
    <div className="superadmin-grid superadmin-grid--form">
      <Panel eyebrow="AUTH + APP_METADATA" title="Usuarios administrativos">
        <EmptyOr rows={snapshot.users} empty="Tu rol no permite listar identidades o todavía no hay usuarios.">
          <DataTable headers={["Usuario", "Rol", "MFA", "Último acceso", "Estado"]}>
            {snapshot.users.map((user) => <tr key={text(user.id)}><td><strong>{text(user.email, "Identidad restringida")}</strong><small>{text(user.id)}</small></td><td>{statusLabel(user.platform_role)}</td><td><Status value={user.mfa_enrolled ? "AAL2 listo" : "MFA pendiente"} /></td><td>{date(user.last_sign_in_at)}</td><td><Status value={user.banned_until ? "SUSPENDIDO" : "ACTIVO"} /></td></tr>)}
          </DataTable>
        </EmptyOr>
      </Panel>
      <Panel eyebrow="INVITACIÓN" title="Alta con alcance explícito">
        <ActionForm busy={busy} submitLabel="Invitar usuario" onSubmit={(form) => action("invite_user", {
          ...form, permissions: String(form.permissions ?? "").split(",").map((value) => value.trim()).filter(Boolean),
          scope: { country_code: "GT", department_code: form.department_code || null, municipality_code: form.municipality_code || null },
        })} fields={[
          ["email", "Correo", "operador@radar.gt", "email"], ["display_name", "Nombre", ""],
          ["platform_role", "Rol", "data_ops"], ["permissions", "Permisos separados por coma", "snapshot:read,data:preview"],
          ["department_code", "Departamento (opcional)", "05"], ["municipality_code", "Municipio (opcional)", "0509"],
          ["reason", "Motivo obligatorio", "Alta operativa QA"],
        ]} />
        <hr className="superadmin-divider" />
        <ActionForm busy={busy} submitLabel="Cambiar estado y revocar" onSubmit={(form) => action("set_user_status", { ...form, is_active: String(form.is_active).toLowerCase() === "true" })} fields={[
          ["user_id", "UUID del usuario", ""], ["is_active", "Activo: true o false", "false"], ["reason", "Motivo obligatorio", "Suspensión administrativa"],
        ]} />
      </Panel>
    </div>
  );
}

function DataVaultModule({ snapshot, action, busy }: ActionModuleProps) {
  return <div className="superadmin-grid superadmin-grid--form"><Panel eyebrow="FUENTES Y LINAJE" title="Cobertura de las 17 capas canónicas"><DataTable headers={["#", "Capa", "Dominio", "Municipios presentes", "Estados fuente", "Actualización"]}>{snapshot.layers.map((layer) => <tr key={layer.layer_id}><td>{layer.layer_order}</td><td><strong>{layer.label}</strong><small>{layer.layer_id}</small></td><td>{layer.domain}</td><td>{layer.municipalities_present}/340</td><td><div className="superadmin-tags">{Object.entries(layer.status_counts).map(([key, count]) => <span key={key}>{statusLabel(key)} · {count}</span>)}</div></td><td>{date(layer.last_updated)}</td></tr>)}</DataTable><h3 className="superadmin-subheading">Registro de fuentes</h3><EmptyOr rows={snapshot.sources} empty="No hay fuentes registradas todavía en el control-plane."><DataTable headers={["source_id","Capa","Período","Escala","Validación"]}>{snapshot.sources.map((source) => <tr key={text(source.source_id)}><td><code>{text(source.source_id)}</code><small>{text(source.source_label)}</small></td><td>{text(source.layer_id)}</td><td>{text(source.source_period)}</td><td>{statusLabel(source.territorial_scale)}</td><td><Status value={source.validation_status} /></td></tr>)}</DataTable></EmptyOr></Panel><Panel eyebrow="PROCEDENCIA" title="Registrar fuente"><ActionForm busy={busy} submitLabel="Guardar fuente" onSubmit={(form) => action("register_source", form)} fields={[["source_id","source_id","TSE-2023-CENTROS"],["layer_id","Capa canónica","TSE_CENTROS_GEO"],["source_label","Fuente","Tribunal Supremo Electoral"],["source_url","URL oficial","https://..."],["territorial_scale","Escala","MUNICIPALITY"],["source_period","Período","2023"],["validation_status","Estado","REGISTERED"],["lineage","Linaje JSON",'{"extract":"manual controlado"}'],["reason","Motivo obligatorio","Alta de fuente oficial"]]} /></Panel></div>;
}

function PublicationModule({ snapshot, action, busy }: ActionModuleProps) {
  return (
    <div className="superadmin-grid superadmin-grid--form">
      <Panel eyebrow="CARGAR → VALIDAR → APROBAR" title="Lotes versionados">
        <EmptyOr rows={snapshot.publication_batches} empty="No hay lotes de publicación en QA.">
          <DataTable headers={["Dataset", "Alcance", "Fuente", "Filas", "Bloqueos", "Estado"]}>{snapshot.publication_batches.map((batch) => <tr key={text(batch.id)}><td><strong>{text(batch.dataset_key)}</strong><small>{text(batch.layer_id)}</small></td><td>{text(batch.scope_type)} · {text(batch.municipality_code, text(batch.department_code, "GT"))}</td><td>{text(batch.source_id)}<small>{text(batch.source_period)}</small></td><td>{number(batch.row_count)}</td><td>{number(batch.blocking_issues)}</td><td><Status value={batch.state} /></td></tr>)}</DataTable>
        </EmptyOr>
        {snapshot.publication_issues.length ? <details className="superadmin-issues"><summary>Ver diferencias y errores recientes ({snapshot.publication_issues.length})</summary><DataTable headers={["Lote", "Severidad", "Código", "Fila/campo", "Detalle"]}>{snapshot.publication_issues.map((issue) => <tr key={text(issue.id)}><td><code>{text(issue.batch_id).slice(0, 8)}</code></td><td><Status value={issue.severity} /></td><td>{text(issue.issue_code)}</td><td>{text(issue.row_reference, text(issue.field_name))}</td><td>{text(issue.message)}</td></tr>)}</DataTable></details> : null}
      </Panel>
      <Panel eyebrow="TRANSICIÓN CONTROLADA" title="Aprobar o publicar lote">
        <PublicationUpload busy={busy} onUploaded={async () => action("snapshot", {})} />
        <hr className="superadmin-divider" />
        <ActionForm busy={busy} submitLabel="Ejecutar transición" onSubmit={(form) => action("transition_publication", form)} fields={[
          ["batch_id", "UUID del lote", ""], ["target_state", "Estado destino", "APPROVED"], ["reason", "Motivo obligatorio", "QA completado sin bloqueos"],
        ]} />
        <p className="superadmin-help">Solo `PREVALIDATED → APPROVED → PUBLISHED`. El rollback crea una versión nueva; nunca reescribe producción.</p>
      </Panel>
    </div>
  );
}

function PublicationUpload({ busy, onUploaded }: { busy: boolean; onUploaded: () => Promise<void> }) {
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const data = new FormData(formElement);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return setMessage("Selecciona un archivo CSV o JSON.");
    const input = Object.fromEntries(Array.from(data.entries())
      .filter(([key]) => key !== "file")
      .map(([key, value]) => [key, String(value).trim() || null]));
    setUploading(true);
    setMessage(null);
    try {
      const result = await uploadPublicationPreview(file, input);
      setMessage(`Preview creado: ${text(result.blocking_issues, "0")} bloqueos.`);
      formElement.reset();
      await onUploaded();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "No se pudo crear el preview.");
    } finally {
      setUploading(false);
    }
  }

  return <form className="superadmin-form" onSubmit={(event) => void submit(event)}>
    <label><span>Archivo versionado</span><input name="file" type="file" accept=".csv,.json,text/csv,application/json" required /></label>
    <label><span>Dataset</span><input name="dataset_key" placeholder="pulse_measurements" required /></label>
    <label><span>Capa canónica (si aplica)</span><input name="layer_id" placeholder="NUCLEO_ELECTORAL" /></label>
    <label><span>Alcance</span><input name="scope_type" placeholder="MUNICIPALITY" required /></label>
    <label><span>Departamento</span><input name="department_code" placeholder="05" /></label>
    <label><span>Municipio</span><input name="municipality_code" placeholder="0509" /></label>
    <label><span>Campaña UUID (opcional)</span><input name="campaign_id" /></label>
    <label><span>source_id</span><input name="source_id" placeholder="TSE-2023-0509" required /></label>
    <label><span>Fuente</span><input name="source_label" placeholder="Tribunal Supremo Electoral" required /></label>
    <label><span>Período</span><input name="source_period" placeholder="2023" required /></label>
    <label><span>Motivo obligatorio</span><input name="reason" placeholder="Carga QA para prevalidación" required /></label>
    {message ? <p className="superadmin-help" role="status">{message}</p> : null}
    <button type="submit" disabled={busy || uploading}>{uploading ? "Calculando preview…" : "Cargar y prevalidar"}</button>
  </form>;
}

function CampaignVaultModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return <Panel eyebrow="SALUD, NO CONTENIDO" title="Campaign Vault por campaña"><p className="superadmin-help">Esta vista devuelve conteos operativos. No expone DPI, padrón, CRM ni documentos privados.</p><DataTable headers={["Municipio", "Electores", "Contactos", "Actividades", "Fiscales", "RTD", "Incidentes"]}>{snapshot.campaign_health.map((item) => <tr key={text(item.campaign_id)}><td><strong>{text(item.municipality_code)}</strong></td><td>{number(item.voter_records)}</td><td>{number(item.contacts)}</td><td>{number(item.activities)}</td><td>{number(item.fiscales)}</td><td>{number(item.rtd_records)}</td><td>{number(item.open_incidents)}</td></tr>)}</DataTable></Panel>;
}

function PulseModule({ snapshot, action, busy }: ActionModuleProps) {
  return <div className="superadmin-grid superadmin-grid--form"><Panel eyebrow="ALCANCE GARANTIZADO" title="Pulso Electoral"><div className="superadmin-scope-rules"><div><strong>Municipal</strong><span>Alcaldía · mismo municipality_code</span></div><div><strong>Departamental</strong><span>Diputación distrital · mismo department_code</span></div><div><strong>Nacional</strong><span>Presidencia, listado nacional y Parlacen · GT</span></div></div><EmptyOr rows={snapshot.pulse_measurements} empty="Pulso aún no ha sido migrado o no existen mediciones QA."><DataTable headers={["Folio", "Elección", "Alcance", "Campo", "Muestra", "Resultados", "Estado"]}>{snapshot.pulse_measurements.map((item) => <tr key={text(item.id)}><td><strong>{text(item.folio)}</strong><small>v{text(item.version)}</small></td><td>{statusLabel(item.election_type)}</td><td>{statusLabel(item.scope_type)} · {text(item.municipality_code, text(item.department_code, "GT"))}</td><td>{text(item.field_start)} → {text(item.field_end)}</td><td>{number(item.sample_size)}</td><td>{number(item.result_count)}</td><td><Status value={item.status} /></td></tr>)}</DataTable></EmptyOr></Panel><Panel eyebrow="BORRADOR VERSIONADO" title="Cargar y transicionar encuesta"><PulseActionForms action={action} busy={busy} /></Panel></div>;
}

function PulseActionForms({ action, busy }: { action: ActionModuleProps["action"]; busy: boolean }) {
  const [message, setMessage] = useState<string | null>(null);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      const measurement = JSON.parse(String(values.measurement));
      const results = JSON.parse(String(values.results));
      await action("save_pulse_draft", { measurement, results, reason: String(values.reason) });
      setMessage(null);
    } catch (error) { setMessage(error instanceof Error ? error.message : "JSON inválido"); }
  }
  return <><form className="superadmin-form" onSubmit={(event) => void save(event)}><label><span>Medición JSON</span><textarea name="measurement" rows={9} required placeholder={'{"folio":"PULSO-0509-001","election_type":"ALCALDIA","municipality_code":"0509","field_start":"2026-09-01","field_end":"2026-09-05","sample_size":400,"scope_label":"Puerto San José","methodology":"...","technical_sheet":{"confidence":95},"source_id":"RADAR-PULSO-001","source_label":"RADAR","version":1}'} /></label><label><span>Resultados aprobables JSON</span><textarea name="results" rows={6} required placeholder={'[{"option_code":"A","candidate_name":"Candidato A","value":50},{"option_code":"B","candidate_name":"Candidato B","value":50}]'} /></label><label><span>Motivo obligatorio</span><input name="reason" required placeholder="Carga QA con ficha técnica" /></label>{message ? <p role="alert" className="superadmin-help">{message}</p> : null}<button type="submit" disabled={busy}>Guardar borrador</button></form><hr className="superadmin-divider" /><ActionForm busy={busy} submitLabel="Transicionar Pulso" onSubmit={(form) => action("transition_pulse", form)} fields={[["measurement_id","UUID medición",""],["target_status","Destino","PREVALIDADA"],["preview_hash","Hash de preview (prevalidación)",""],["reason","Motivo obligatorio","Ficha técnica y resultados verificados"]]} /></>;
}

function RtdModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return <><Panel eyebrow="MONITOREO AGREGADO" title="RTD Día D"><p className="superadmin-help">No se consultan filas crudas ni imágenes de actas. Solo salud operativa por campaña.</p><EmptyOr rows={snapshot.rtd} empty="No hay campañas RTD reales con recepción registrada."><DataTable headers={["Municipio", "Fiscales", "Centros recibidos", "JRV recibidas", "Borradores", "Confirmadas", "Alertas", "Actualización"]}>{snapshot.rtd.map((item) => <tr key={text(item.campaign_id)}><td><strong>{text(item.municipality_code)}</strong></td><td>{number(item.fiscales)}</td><td>{number(item.centers_received)}</td><td>{number(item.jrv_received)}</td><td>{number(item.drafts)}</td><td>{number(item.confirmed)}</td><td><Status value={Number(item.open_incidents) ? `${number(item.open_incidents)} ABIERTAS` : "SIN ALERTAS"} /></td><td>{date(item.last_update)}</td></tr>)}</DataTable></EmptyOr></Panel><div className="superadmin-grid"><Panel eyebrow="CINCO ACTAS Y RETRASOS" title="Snapshots operativos"><EmptyOr rows={snapshot.rtd_monitoring} empty="No hay snapshots agregados registrados."><DataTable headers={["Territorio","Centros","JRV","Fiscales","Actas esperadas","Recibidas","Error","Retrasos","Corte"]}>{snapshot.rtd_monitoring.map((item) => <tr key={text(item.id)}><td>{text(item.municipality_code, text(item.department_code, "GT"))}</td><td>{number(item.centers_total)}</td><td>{number(item.jrv_total)}</td><td>{number(item.fiscales_assigned)}</td><td>{number(item.actas_expected)}</td><td>{number(item.actas_received)}</td><td>{number(item.actas_with_error)}</td><td>{number(item.delayed_jrv)}</td><td>{date(item.snapshot_at)}</td></tr>)}</DataTable></EmptyOr></Panel></div></>;
}

function QaModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return <div className="superadmin-grid superadmin-grid--wide"><Panel eyebrow="PRUEBAS" title="Ejecuciones QA"><EmptyOr rows={snapshot.qa_runs} empty="No hay ejecuciones QA registradas en la base.">{snapshot.qa_runs.map((run) => <TimelineRow key={text(run.id)} title={`${text(run.suite)} · ${statusLabel(run.status)}`} detail={`${text(run.git_branch)} · ${text(run.git_sha).slice(0, 12)}`} meta={date(run.finished_at ?? run.started_at)} />)}</EmptyOr></Panel><Panel eyebrow="VERSIONES" title="Despliegues"><EmptyOr rows={snapshot.deployments} empty="No hay despliegues administrativos registrados.">{snapshot.deployments.map((deployment) => <TimelineRow key={text(deployment.id)} title={`${text(deployment.environment)} · ${statusLabel(deployment.status)}`} detail={`${text(deployment.version_label)} · ${text(deployment.git_sha).slice(0, 12)}`} meta={date(deployment.deployed_at ?? deployment.created_at)} />)}</EmptyOr></Panel></div>;
}

function AuditModule({ snapshot }: { snapshot: AdminSnapshot }) {
  return <Panel eyebrow="TRAZABILIDAD APPEND-ONLY" title="Registro administrativo"><EmptyOr rows={snapshot.audit} empty="No hay eventos administrativos todavía."><DataTable headers={["Fecha", "Actor", "Acción", "Objeto", "Territorio", "Motivo"]}>{snapshot.audit.map((event) => <tr key={text(event.id)}><td>{date(event.created_at)}</td><td><strong>{statusLabel(event.actor_role)}</strong><small>{text(event.actor_user_id)}</small></td><td>{statusLabel(event.action)}</td><td>{text(event.entity_type)}<small>{text(event.entity_id)}</small></td><td>{text(event.municipality_code, text(event.department_code, "GT"))}</td><td>{text(event.reason)}</td></tr>)}</DataTable></EmptyOr></Panel>;
}

function SupportModule({ snapshot, action, busy }: ActionModuleProps) {
  return <div className="superadmin-grid superadmin-grid--form"><Panel eyebrow="SIN SUPLANTACIÓN" title="Sesiones de diagnóstico"><EmptyOr rows={snapshot.support} empty="No hay sesiones de soporte abiertas o históricas."><DataTable headers={["Ticket", "Alcance", "Modo", "Estado", "Expira"]}>{snapshot.support.map((session) => <tr key={text(session.id)}><td><strong>{text(session.ticket_ref)}</strong><small>{text(session.id)}</small></td><td>{text(session.municipality_code, text(session.campaign_id))}</td><td>{statusLabel(session.access_mode)}</td><td><Status value={session.status} /></td><td>{date(session.expires_at)}</td></tr>)}</DataTable></EmptyOr></Panel><Panel eyebrow="ACCESO TEMPORAL" title="Abrir diagnóstico"><ActionForm busy={busy} submitLabel="Abrir sesión" onSubmit={(form) => action("open_support_session", form)} fields={[["ticket_ref","Ticket","SOP-0509-001"],["municipality_code","Municipio","0509"],["campaign_id","Campaña (opcional)",""],["access_mode","Modo","READ_ONLY"],["expires_at","Caducidad","", "datetime-local"],["reason","Motivo obligatorio","Diagnóstico solicitado por titular"]]} /><p className="superadmin-help">Máximo 8 horas. No cambia de identidad y todo acceso queda asociado al ticket.</p></Panel></div>;
}

interface ActionModuleProps { snapshot: AdminSnapshot; action: (operation: string, input: Record<string, unknown>) => Promise<void>; busy: boolean }

function Kpi({ label, value, note, tone }: { label: string; value: string; note: string; tone: string }) {
  return <article className={`superadmin-kpi is-${tone}`}><span /><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function Panel({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  return <section className="superadmin-panel"><header><span>{eyebrow}</span><h2>{title}</h2></header>{children}</section>;
}

function MunicipalitySignal({ municipality }: { municipality: AdminMunicipalityState }) {
  return <article><div><code>{municipality.municipality_code}</code><Status value={municipality.operational_state} /></div><h3>{municipality.municipality_name}</h3><p>{municipality.department_name}</p><dl><div><dt>Capas</dt><dd>{municipality.canonical_layers_present}/17</dd></div><div><dt>Campañas</dt><dd>{municipality.active_campaigns}</dd></div><div><dt>Miembros</dt><dd>{municipality.campaign_members}</dd></div></dl><Link to={`/municipio/${municipality.municipality_code}`}>Abrir ruta municipal ↗</Link></article>;
}

function DataTable({ headers, children }: { headers: string[]; children: ReactNode }) {
  return <div className="superadmin-table-wrap"><table><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{children}</tbody></table></div>;
}

function Status({ value }: { value: unknown }) {
  const normalized = text(value).toLowerCase();
  const tone = /active|ready|published|approved|confirmed|protected|sin alertas|aal2/.test(normalized) ? "good" : /error|block|suspend|reject|pendiente|alert/.test(normalized) ? "bad" : "neutral";
  return <span className={`superadmin-status is-${tone}`}>{statusLabel(value)}</span>;
}

function EmptyOr({ rows, empty, children }: { rows: unknown[]; empty: string; children: ReactNode }) {
  return rows.length ? <>{children}</> : <div className="superadmin-empty"><strong>Sin datos verificados</strong><p>{empty}</p></div>;
}

function TimelineRow({ title, detail, meta }: { title: string; detail: string; meta: string }) {
  return <div className="superadmin-timeline"><i /><div><strong>{title}</strong><p>{detail}</p></div><time>{meta}</time></div>;
}

function DefinitionList({ entries }: { entries: Array<[string, string]> }) {
  return <dl className="superadmin-definitions">{entries.map(([term, detail]) => <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>)}</dl>;
}

type Field = [name: string, label: string, placeholder: string, type?: string];
function ActionForm({ fields, submitLabel, onSubmit, busy }: { fields: Field[]; submitLabel: string; onSubmit: (values: Record<string, unknown>) => Promise<void>; busy: boolean }) {
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const values = Object.fromEntries(Array.from(data.entries()).map(([key, value]) => [key, String(value).trim() || null]));
    await onSubmit(values);
  }
  return <form className="superadmin-form" onSubmit={(event) => void submit(event)}>{fields.map(([name, label, placeholder, type = "text"]) => <label key={name}><span>{label}</span><input name={name} type={type} placeholder={placeholder} required={["reason", "municipality_code", "email", "platform_role", "batch_id", "target_state", "ticket_ref", "access_mode", "expires_at"].includes(name)} /></label>)}<button type="submit" disabled={busy}>{busy ? "Procesando…" : submitLabel}</button></form>;
}
