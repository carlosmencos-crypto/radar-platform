import { persistEvidenceOnce, readBoundedForm } from "./evidence-retry.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

type JsonRecord = Record<string, unknown>;

const ALLOWED_ORIGINS = new Set([
  "https://fiscales-qa.wowlatam.com",
  "https://radargt.wowlatam.com",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
]);
const ELECTION_TYPES = new Set([
  "PRESIDENTE",
  "CORPORACION_MUNICIPAL",
  "DIP_DIST",
  "DIP_NAC",
  "DIP_PAR",
]);
const INCIDENT_CATEGORIES = new Set([
  "APERTURA_CIERRE",
  "MATERIAL_ELECTORAL",
  "ACCESO_ACREDITACION",
  "VIOLENCIA_INTIMIDACION",
  "PROPAGANDA",
  "PROBLEMA_TECNICO",
  "CONTEO",
  "OTRA",
]);
const INCIDENT_URGENCIES = new Set(["BAJA", "MEDIA", "ALTA", "INMEDIATA"]);
const EVIDENCE_BUCKET = "radar-day-d-evidence";
const MAX_FILE_SIZE = 12 * 1024 * 1024;

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function serviceClient() {
  return createClient(
    requiredEnv("SUPABASE_URL"),
    requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  return ALLOWED_ORIGINS.has(origin) ? origin : "";
}

function corsHeaders(request: Request) {
  const origin = allowedOrigin(request);
  return {
    "Access-Control-Allow-Origin": origin || "https://fiscales-qa.wowlatam.com",
    "Access-Control-Allow-Headers":
      "authorization, apikey, content-type, x-client-info, x-radar-session, x-idempotency-key",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function response(request: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function apiError(message: string, status = 400) {
  return Object.assign(new Error(message), { status });
}

function asObject(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function randomHex(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return Array.from(value, (item) => item.toString(16).padStart(2, "0")).join(
    "",
  );
}

async function sha256(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (item) =>
    item.toString(16).padStart(2, "0"),
  ).join("");
}

function normalizeAccessCode(value: unknown) {
  return String(value ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 32);
}

function finiteNumber(value: unknown, min: number, max: number) {
  const number = Number(value);
  return Number.isFinite(number) && number >= min && number <= max
    ? number
    : null;
}

function integer(value: unknown, maximum = 5000) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= maximum
    ? number
    : Number.NaN;
}

function optionalInteger(value: unknown, maximum = 5000) {
  if (value === null || value === undefined || value === "") return null;
  return integer(value, maximum);
}

function safeName(value: string) {
  return (
    value
      .normalize("NFKD")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 120) || "evidencia"
  );
}

function routePath(request: Request) {
  const pathname = new URL(request.url).pathname;
  const marker = "/fiscal-api";
  const index = pathname.indexOf(marker);
  const route = index >= 0 ? pathname.slice(index + marker.length) : pathname;
  return route || "/";
}

type SessionContext = {
  session: JsonRecord;
  grant: JsonRecord;
  assignment: JsonRecord;
  campaign: JsonRecord;
};

async function requireSession(
  request: Request,
  service: SupabaseClient,
): Promise<SessionContext> {
  const secret = request.headers.get("x-radar-session")?.trim() ?? "";
  if (secret.length < 32) throw apiError("Acceso fiscal requerido.", 401);
  const sessionHash = await sha256(secret);
  const { data: session, error: sessionError } = await service
    .from("day_d_fiscal_sessions")
    .select("*")
    .eq("session_hash", sessionHash)
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (sessionError || !session)
    throw apiError("La sesión venció o fue revocada.", 401);
  const expectedAgent = String(session.user_agent_hash ?? "");
  const currentAgent = await sha256(request.headers.get("user-agent") ?? "");
  if (expectedAgent && expectedAgent !== currentAgent)
    throw apiError("Este acceso está vinculado a otro teléfono.", 401);

  const [{ data: grant }, { data: assignment }, { data: campaign }] =
    await Promise.all([
      service
        .from("day_d_fiscal_access_grants")
        .select("*")
        .eq("id", session.access_grant_id)
        .maybeSingle(),
      service
        .from("day_d_jrv_assignments")
        .select("*")
        .eq("id", session.assignment_id)
        .maybeSingle(),
      service
        .from("campaigns")
        .select("id,name,is_demo,status,municipality_id")
        .eq("id", session.campaign_id)
        .maybeSingle(),
    ]);
  if (
    !grant ||
    !assignment ||
    !campaign ||
    grant.status !== "ACTIVE" ||
    grant.revoked_at ||
    !assignment.active ||
    campaign.status !== "active"
  ) {
    throw apiError("El acceso ya no está activo.", 401);
  }
  if (new Date(String(grant.expires_at)).getTime() <= Date.now())
    throw apiError("El acceso venció.", 401);
  if (
    String(grant.assignment_id) !== String(assignment.id) ||
    String(grant.campaign_id) !== String(campaign.id)
  ) {
    throw apiError("El alcance del acceso no es válido.", 403);
  }
  if (
    Date.now() - new Date(String(session.last_seen_at ?? 0)).getTime() >
    60_000
  ) {
    await service
      .from("day_d_fiscal_sessions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", session.id);
  }
  return { session, grant, assignment, campaign };
}

async function audit(
  service: SupabaseClient,
  context: SessionContext,
  action: string,
  subjectType: string,
  subjectId = "",
  metadata: JsonRecord = {},
) {
  await service.from("day_d_fiscal_audit_log").insert({
    campaign_id: context.campaign.id,
    municipality_code: context.assignment.municipality_code,
    fiscal_person_id: context.assignment.fiscal_person_id,
    access_grant_id: context.grant.id,
    action,
    subject_type: subjectType,
    subject_id: subjectId,
    metadata,
  });
}

function assignmentPayload(value: JsonRecord) {
  return {
    id: String(value.id ?? ""),
    centerId: String(value.center_id ?? ""),
    centerName: String(value.center_name ?? "Centro asignado"),
    centerReference: String(value.center_reference ?? ""),
    jrvNumber: Number(value.jrv_number ?? 0),
    responsibleName: String(value.responsible_name ?? "Pendiente de asignar"),
    isCenterResponsible: value.is_center_responsible === true,
    checkedIn: value.checked_in === true,
    checkedInAt: value.checked_in_at ? String(value.checked_in_at) : "",
    checkedInPhoneAt: value.checked_in_phone_at
      ? String(value.checked_in_phone_at)
      : "",
    tableClosed: value.table_closed === true,
    tableClosedAt: value.table_closed_at ? String(value.table_closed_at) : "",
    transportReady: value.transport_ready === true,
    transportReportedAt: value.transport_reported_at
      ? String(value.transport_reported_at)
      : "",
    foodReady: value.food_ready === true,
    foodReportedAt: value.food_reported_at
      ? String(value.food_reported_at)
      : "",
    mobileDataReady: value.mobile_data_ready === true,
    mobileDataSource: String(value.mobile_data_source ?? ""),
    mobileDataReportedAt: value.mobile_data_reported_at
      ? String(value.mobile_data_reported_at)
      : "",
    supportNeeded: value.support_needed === true,
    supportReportedAt: value.support_reported_at
      ? String(value.support_reported_at)
      : "",
    lastFiscalSyncAt: value.last_fiscal_sync_at
      ? String(value.last_fiscal_sync_at)
      : "",
    rtdSubmitted: value.rtd_submitted === true,
  };
}

async function exchangeAccess(request: Request, service: SupabaseClient) {
  if (!allowedOrigin(request)) throw apiError("Origen no permitido.", 403);
  const body = asObject(await request.json().catch(() => ({})));
  const code = normalizeAccessCode(body.code);
  const token = String(body.token ?? "")
    .trim()
    .slice(0, 256);
  const credential = token || code;
  if (credential.length < 8) throw apiError("Ingresa un código válido.");
  const forwarded = (request.headers.get("x-forwarded-for") ?? "")
    .split(",")[0]
    .trim();
  const ipHash = await sha256(forwarded || "unknown");
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count: failedCount } = await service
    .from("day_d_fiscal_access_attempts")
    .select("id", { count: "exact", head: true })
    .eq("ip_hash", ipHash)
    .eq("successful", false)
    .gte("created_at", since);
  if ((failedCount ?? 0) >= 12)
    throw apiError(
      "Demasiados intentos. Espera 15 minutos o solicita un acceso nuevo.",
      429,
    );

  const credentialHash = await sha256(credential);
  let query = service.from("day_d_fiscal_access_grants").select("*");
  query = token
    ? query.eq("link_hash", credentialHash)
    : query.eq("code_hash", credentialHash);
  const { data: grant } = await query.maybeSingle();
  const now = new Date();
  const valid =
    grant &&
    grant.status === "ACTIVE" &&
    !grant.revoked_at &&
    new Date(String(grant.expires_at)).getTime() > now.getTime();
  await service.from("day_d_fiscal_access_attempts").insert({
    ip_hash: ipHash,
    credential_hint: code ? code.slice(-3) : "LINK",
    successful: Boolean(valid),
    grant_id: grant?.id ?? null,
  });
  if (!valid)
    throw apiError("El código venció, fue revocado o no existe.", 401);

  const { data: assignment } = await service
    .from("day_d_jrv_assignments")
    .select("*")
    .eq("id", grant.assignment_id)
    .eq("active", true)
    .maybeSingle();
  const { data: campaign } = await service
    .from("campaigns")
    .select("id,status,is_demo")
    .eq("id", grant.campaign_id)
    .eq("status", "active")
    .maybeSingle();
  if (!assignment || !campaign)
    throw apiError("La asignación ya no está disponible.", 401);
  await service
    .from("day_d_fiscal_sessions")
    .update({ revoked_at: now.toISOString() })
    .eq("access_grant_id", grant.id)
    .is("revoked_at", null);
  const sessionSecret = randomHex(32);
  const sessionHash = await sha256(sessionSecret);
  const sessionExpires = new Date(
    Math.min(
      new Date(String(grant.expires_at)).getTime(),
      Date.now() + 7 * 24 * 60 * 60 * 1000,
    ),
  );
  const userAgentHash = await sha256(request.headers.get("user-agent") ?? "");
  const { error: sessionError } = await service
    .from("day_d_fiscal_sessions")
    .insert({
      session_hash: sessionHash,
      access_grant_id: grant.id,
      assignment_id: assignment.id,
      campaign_id: grant.campaign_id,
      municipality_code: grant.municipality_code,
      center_id: grant.center_id,
      jrv_number: grant.jrv_number,
      fiscal_person_id: grant.fiscal_person_id,
      ip_hash: ipHash,
      user_agent_hash: userAgentHash,
      expires_at: sessionExpires.toISOString(),
    });
  if (sessionError) throw sessionError;
  await service
    .from("day_d_fiscal_access_grants")
    .update({ last_access_at: now.toISOString() })
    .eq("id", grant.id);
  await service.from("day_d_fiscal_audit_log").insert({
    campaign_id: grant.campaign_id,
    municipality_code: grant.municipality_code,
    fiscal_person_id: grant.fiscal_person_id,
    access_grant_id: grant.id,
    action: "ACCESS_GRANTED",
    subject_type: "SESSION",
    metadata: { method: token ? "LINK" : "CODE" },
  });
  return response(request, {
    ok: true,
    sessionToken: sessionSecret,
    expiresAt: sessionExpires.toISOString(),
  });
}

async function logout(request: Request, service: SupabaseClient) {
  const secret = request.headers.get("x-radar-session")?.trim() ?? "";
  if (secret)
    await service
      .from("day_d_fiscal_sessions")
      .update({ revoked_at: new Date().toISOString() })
      .eq("session_hash", await sha256(secret));
  return response(request, { ok: true });
}

async function portalMe(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const municipalityId = String(context.campaign.municipality_id ?? "");
  const [{ data: municipality }, { data: identity }, incidentCount, rtdCount] =
    await Promise.all([
      service
        .from("municipalities")
        .select("municipality_code,municipality_name")
        .eq("id", municipalityId)
        .maybeSingle(),
      service.rpc("radar_fiscal_campaign_identity_v1", {
        p_campaign_id: context.campaign.id,
      }),
      service
        .from("day_d_incidents")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", context.assignment.id),
      service
        .from("day_d_rtd_folios")
        .select("id", { count: "exact", head: true })
        .eq("assignment_id", context.assignment.id)
        .in("status", ["ENVIADO", "VALIDADO"]),
    ]);
  const demoMode =
    context.campaign.is_demo === true ||
    context.grant.demo_mode === true ||
    context.grant.test_mode === true;
  const scopeKey = demoMode ? "TSE2023" : String(context.campaign.id);
  const { data: catalogRows, error: catalogError } = await service
    .from("day_d_election_options")
    .select(
      "election_type,election_label,option_code,option_label,sort_order,catalog_version,official",
    )
    .eq("scope_key", scopeKey)
    .eq("active", true)
    .order("election_type")
    .order("sort_order");
  if (catalogError) throw catalogError;
  const labels: Record<string, string> = {
    PRESIDENTE: "Presidencia y Vicepresidencia",
    CORPORACION_MUNICIPAL: "Corporación municipal",
    DIP_DIST: "Diputaciones distritales",
    DIP_NAC: "Listado nacional",
    DIP_PAR: "Parlamento Centroamericano",
  };
  const elections = Array.from(ELECTION_TYPES).map((type) => {
    const rows = (catalogRows ?? []).filter(
      (row) => row.election_type === type,
    );
    return {
      type,
      label: rows[0]?.election_label ?? labels[type],
      catalogMode: rows.length
        ? rows[0].official
          ? "CONFIGURADO"
          : "DEMOSTRACION"
        : "PENDIENTE",
      catalogVersion: rows[0]?.catalog_version ?? "PENDIENTE_2027",
      options: rows.map((row) => ({
        code: row.option_code,
        label: row.option_label,
      })),
    };
  });
  let centerOverview = null;
  if (context.assignment.is_center_responsible === true) {
    const { data: centerRows } = await service
      .from("day_d_jrv_assignments")
      .select("checked_in,support_needed,table_closed,rtd_submitted")
      .eq("campaign_id", context.campaign.id)
      .eq("center_id", context.assignment.center_id)
      .eq("active", true);
    centerOverview = {
      assigned: centerRows?.length ?? 0,
      checkedIn: (centerRows ?? []).filter((item) => item.checked_in).length,
      supportNeeded: (centerRows ?? []).filter((item) => item.support_needed)
        .length,
      tableClosed: (centerRows ?? []).filter((item) => item.table_closed)
        .length,
      rtdSubmitted: (centerRows ?? []).filter((item) => item.rtd_submitted)
        .length,
    };
  }
  const identityValue = asObject(identity);
  return response(request, {
    fiscal: {
      id: String(context.assignment.fiscal_person_id),
      fullName: String(context.assignment.fiscal_name),
    },
    campaign: {
      name: String(context.campaign.name),
      partyName: String(identityValue.party_name ?? "Organización política"),
      partyLogoUrl: String(identityValue.party_logo_data_url ?? ""),
      partyLogoVersion: String(identityValue.updated_at ?? "actual"),
      municipality: String(
        municipality?.municipality_name ?? "Municipio asignado",
      ),
      municipalityCode: String(
        municipality?.municipality_code ?? context.assignment.municipality_code,
      ),
    },
    assignment: assignmentPayload(context.assignment),
    centerOverview,
    elections,
    counts: {
      incidents: incidentCount.count ?? 0,
      rtdSubmitted: rtdCount.count ?? 0,
    },
    session: { demoMode, testMode: context.grant.test_mode === true },
  });
}

async function updateStatus(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const payload = asObject(await request.json().catch(() => ({})));
  const action = String(payload.action ?? "").toUpperCase();
  const now = new Date().toISOString();
  const updates: JsonRecord = { last_fiscal_sync_at: now };
  if (action === "CHECK_IN") {
    if (context.assignment.checked_in !== true) {
      updates.checked_in = true;
      updates.checked_in_at = now;
      updates.checked_in_phone_at =
        String(payload.clientTime ?? "").slice(0, 40) || null;
      updates.checkin_latitude = finiteNumber(payload.latitude, -90, 90);
      updates.checkin_longitude = finiteNumber(payload.longitude, -180, 180);
      updates.checkin_accuracy = finiteNumber(payload.accuracy, 0, 100000);
    }
  } else if (action === "LOGISTICS") {
    if (
      ![
        payload.transportReady,
        payload.foodReady,
        payload.mobileDataReady,
        payload.supportNeeded,
      ].every((value) => typeof value === "boolean")
    ) {
      throw apiError("Responde las cuatro preguntas logísticas.");
    }
    const source = payload.mobileDataReady
      ? String(payload.mobileDataSource ?? "").toUpperCase()
      : "";
    if (payload.mobileDataReady && !["PROPIOS", "CAMPANA"].includes(source))
      throw apiError("Indica el origen de los datos móviles.");
    Object.assign(updates, {
      transport_ready: payload.transportReady,
      transport_reported_at: now,
      food_ready: payload.foodReady,
      food_reported_at: now,
      mobile_data_ready: payload.mobileDataReady,
      mobile_data_source: source,
      mobile_data_reported_at: now,
      support_needed: payload.supportNeeded,
      support_reported_at: now,
    });
  } else if (action === "TABLE_CLOSED") {
    if (context.assignment.table_closed !== true) {
      updates.table_closed = true;
      updates.table_closed_at = now;
    }
  } else {
    throw apiError("Acción no permitida.");
  }
  const { data: assignment, error } = await service
    .from("day_d_jrv_assignments")
    .update(updates)
    .eq("id", context.assignment.id)
    .select("*")
    .single();
  if (error) throw error;
  await audit(
    service,
    context,
    action === "LOGISTICS" ? "LOGISTICS_REPORTED" : action,
    "JRV_ASSIGNMENT",
    String(context.assignment.id),
  );
  return response(request, {
    assignment: assignmentPayload(assignment),
    serverConfirmedAt: now,
  });
}

async function signedEvidence(service: SupabaseClient, evidence: JsonRecord[]) {
  const output = [];
  for (const file of evidence) {
    const { data } = await service.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(String(file.object_path), 600);
    output.push({
      id: String(file.id),
      name: String(file.file_name),
      mimeType: String(file.mime_type),
      size: Number(file.file_size),
      url: data?.signedUrl ?? "",
    });
  }
  return output;
}

async function incidentList(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const { data: incidents, error } = await service
    .from("day_d_incidents")
    .select("*")
    .eq("assignment_id", context.assignment.id)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const output = [];
  for (const incident of incidents ?? []) {
    const [{ data: updates }, { data: evidence }] = await Promise.all([
      service
        .from("day_d_incident_updates")
        .select("*")
        .eq("incident_id", incident.id)
        .order("created_at"),
      service
        .from("day_d_evidence")
        .select("*")
        .eq("subject_type", "INCIDENT")
        .eq("subject_id", incident.id)
        .order("created_at"),
    ]);
    output.push({
      id: String(incident.id),
      folio: incident.folio,
      occurredAt: incident.occurred_at,
      category: incident.category,
      description: incident.description,
      urgency: incident.urgency,
      status: incident.status,
      files: await signedEvidence(service, evidence ?? []),
      updates: (updates ?? []).map((item) => ({
        id: String(item.id),
        note: item.note,
        createdAt: item.created_at,
      })),
    });
  }
  return response(request, { incidents: output });
}

async function createIncident(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const payload = asObject(await request.json().catch(() => ({})));
  const category = String(payload.category ?? "").toUpperCase();
  const urgency = String(payload.urgency ?? "").toUpperCase();
  const description = String(payload.description ?? "").trim();
  const idempotencyKey = String(payload.idempotencyKey ?? "")
    .trim()
    .slice(0, 100);
  if (!INCIDENT_CATEGORIES.has(category) || !INCIDENT_URGENCIES.has(urgency))
    throw apiError("Selecciona categoría y urgencia válidas.");
  if (description.length < 5 || description.length > 2000)
    throw apiError("Describe la incidencia en 5 a 2,000 caracteres.");
  if (idempotencyKey.length < 12)
    throw apiError("Identificador de envío inválido.");
  const { data: existing } = await service
    .from("day_d_incidents")
    .select("*")
    .eq("campaign_id", context.campaign.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();
  if (existing) {
    if (String(existing.assignment_id) !== String(context.assignment.id))
      throw apiError("El identificador pertenece a otra asignación.", 403);
    return response(request, {
      incident: { id: String(existing.id) },
      duplicateNeutralized: true,
    });
  }
  const occurred = new Date(String(payload.occurredAt ?? ""));
  const date = Number.isNaN(occurred.getTime()) ? new Date() : occurred;
  const folio = `INC-${context.assignment.municipality_code}-${context.assignment.jrv_number}-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomHex(3).toUpperCase()}`;
  const { data: incident, error } = await service
    .from("day_d_incidents")
    .insert({
      folio,
      campaign_id: context.campaign.id,
      municipality_code: context.assignment.municipality_code,
      assignment_id: context.assignment.id,
      center_id: context.assignment.center_id,
      jrv_number: context.assignment.jrv_number,
      fiscal_person_id: context.assignment.fiscal_person_id,
      is_demo: context.campaign.is_demo === true,
      is_test: context.grant.test_mode === true,
      idempotency_key: idempotencyKey,
      occurred_at: date.toISOString(),
      category,
      description,
      urgency,
    })
    .select("*")
    .single();
  if (error?.code === "23505") {
    const { data: winner, error: lookupError } = await service.from("day_d_incidents")
      .select("id,assignment_id").eq("campaign_id", context.campaign.id)
      .eq("idempotency_key", idempotencyKey).maybeSingle();
    if (lookupError) throw lookupError;
    if (winner && String(winner.assignment_id) === String(context.assignment.id))
      return response(request, { incident: { id: String(winner.id) }, duplicateNeutralized: true });
    if (winner) throw apiError("El identificador pertenece a otra asignación.", 403);
  }
  if (error) throw error;
  await service.from("day_d_incident_updates").insert({
    incident_id: incident.id,
    author_type: "FISCAL",
    author_id: String(context.assignment.fiscal_person_id),
    note: "Incidencia enviada.",
    next_status: "ENVIADA",
  });
  await audit(
    service,
    context,
    "INCIDENT_CREATED",
    "INCIDENT",
    String(incident.id),
    { folio, category, urgency },
  );
  return response(
    request,
    { incident: { id: String(incident.id), folio } },
    201,
  );
}

async function addIncidentNote(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
  incidentId: string,
) {
  const payload = asObject(await request.json().catch(() => ({})));
  const note = String(payload.note ?? "")
    .trim()
    .slice(0, 1000);
  if (note.length < 2) throw apiError("Escribe una actualización.");
  const { data: incident } = await service
    .from("day_d_incidents")
    .select("id")
    .eq("id", incidentId)
    .eq("assignment_id", context.assignment.id)
    .maybeSingle();
  if (!incident) throw apiError("Incidencia no encontrada.", 404);
  await service.from("day_d_incident_updates").insert({
    incident_id: incident.id,
    author_type: "FISCAL",
    author_id: String(context.assignment.fiscal_person_id),
    note,
  });
  await audit(service, context, "INCIDENT_NOTE", "INCIDENT", incidentId);
  return response(request, { ok: true });
}

async function getCatalog(
  service: SupabaseClient,
  context: SessionContext,
  electionType: string,
) {
  const demoMode =
    context.campaign.is_demo === true ||
    context.grant.demo_mode === true ||
    context.grant.test_mode === true;
  const scopeKey = demoMode ? "TSE2023" : String(context.campaign.id);
  const { data, error } = await service
    .from("day_d_election_options")
    .select("*")
    .eq("scope_key", scopeKey)
    .eq("election_type", electionType)
    .eq("active", true)
    .order("sort_order");
  if (error) throw error;
  if (!data?.length)
    throw apiError(
      "El catálogo oficial de esta elección aún no está configurado.",
      409,
    );
  return data;
}

async function rtdList(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const { data: folios, error } = await service
    .from("day_d_rtd_folios")
    .select("*")
    .eq("assignment_id", context.assignment.id)
    .order("election_type");
  if (error) throw error;
  const output = [];
  for (const folio of folios ?? []) {
    const [{ data: votes }, { data: files }] = await Promise.all([
      service.from("day_d_rtd_votes").select("*").eq("rtd_folio_id", folio.id),
      service
        .from("day_d_evidence")
        .select("*")
        .eq("subject_type", "RTD")
        .eq("subject_id", folio.id)
        .order("created_at"),
    ]);
    output.push({
      id: String(folio.id),
      folio: folio.folio,
      electionType: folio.election_type,
      status: folio.status,
      catalogVersion: folio.catalog_version,
      isDemo: folio.is_demo,
      isTest: folio.is_test,
      nullVotes: folio.null_votes,
      blankVotes: folio.blank_votes,
      ballotTotal: folio.voters_present,
      registeredElectors: null,
      votersPresent: folio.voters_present,
      ballotsReceived: folio.ballots_received,
      ballotsUnused: folio.ballots_unused,
      observations: folio.observations,
      inconsistency: folio.inconsistency,
      totalDigitized: folio.total_digitized,
      submittedAt: folio.submitted_at ?? "",
      votes: (votes ?? []).map((vote) => ({
        code: vote.option_code,
        label: vote.option_label,
        votes: vote.votes,
      })),
      files: await signedEvidence(service, files ?? []),
    });
  }
  return response(request, { folios: output });
}

async function saveRtd(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
) {
  const payload = asObject(await request.json().catch(() => ({})));
  const electionType = String(payload.electionType ?? "").toUpperCase();
  const action = String(payload.action ?? "SAVE_DRAFT").toUpperCase();
  if (
    !ELECTION_TYPES.has(electionType) ||
    !["SAVE_DRAFT", "SUBMIT"].includes(action)
  )
    throw apiError("Elección o acción inválida.");
  const catalog = await getCatalog(service, context, electionType);
  const version = String(catalog[0].catalog_version);
  const allowed = new Map(
    catalog.map((item) => [
      String(item.option_code),
      String(item.option_label),
    ]),
  );
  const inputVotes = Array.isArray(payload.votes)
    ? payload.votes.map(asObject)
    : [];
  const seen = new Set<string>();
  const votes = inputVotes.map((item) => {
    const code = String(item.code ?? "");
    const amount = integer(item.votes);
    if (!allowed.has(code) || seen.has(code) || !Number.isFinite(amount))
      return null;
    seen.add(code);
    return { code, label: allowed.get(code)!, votes: amount };
  });
  if (votes.some((item) => item === null))
    throw apiError(
      "Los votos deben ser enteros no negativos y pertenecer al catálogo autorizado.",
    );
  const normalizedVotes = votes.filter(
    (item): item is NonNullable<typeof item> => Boolean(item),
  );
  const nullVotes = integer(payload.nullVotes);
  const blankVotes = integer(payload.blankVotes);
  const votersPresent = optionalInteger(payload.votersPresent);
  const ballotsReceived = optionalInteger(payload.ballotsReceived);
  const ballotsUnused = optionalInteger(payload.ballotsUnused);
  if (
    ![nullVotes, blankVotes].every(Number.isFinite) ||
    [votersPresent, ballotsReceived, ballotsUnused].some(
      (value) => value !== null && !Number.isFinite(value),
    )
  ) {
    throw apiError("Usa únicamente números enteros no negativos.");
  }
  const validVotes = normalizedVotes.reduce((sum, item) => sum + item.votes, 0);
  const totalDigitized = validVotes + nullVotes + blankVotes;
  if (totalDigitized > 5000)
    throw apiError("El total excede un límite razonable para una JRV.");
  const inconsistencies: string[] = [];
  if (votersPresent !== null && votersPresent !== totalDigitized)
    inconsistencies.push(
      `Votos válidos, nulos y blancos (${totalDigitized}) no coinciden con las personas que votaron (${votersPresent}).`,
    );
  if (
    votersPresent !== null &&
    ballotsReceived !== null &&
    ballotsUnused !== null &&
    votersPresent + ballotsUnused !== ballotsReceived
  )
    inconsistencies.push(
      `Personas que votaron (${votersPresent}) más papeletas no usadas (${ballotsUnused}) no coincide con las papeletas recibidas (${ballotsReceived}).`,
    );
  const now = new Date().toISOString();
  let { data: folio } = await service
    .from("day_d_rtd_folios")
    .select("*")
    .eq("campaign_id", context.campaign.id)
    .eq("jrv_number", context.assignment.jrv_number)
    .eq("election_type", electionType)
    .maybeSingle();
  const submissionKey = String(payload.submissionKey ?? "").slice(0, 100);
  if (folio && folio.status !== "BORRADOR") {
    if (
      action === "SUBMIT" &&
      submissionKey &&
      submissionKey === folio.submission_key
    ) {
      if (!folio.is_test)
        await service.rpc("radar_fiscal_publish_rtd_v1", {
          p_folio_id: folio.id,
        });
      return response(request, {
        folio: { id: String(folio.id), status: folio.status },
        duplicateNeutralized: true,
        serverConfirmedAt: folio.submitted_at,
      });
    }
    throw apiError(
      "Este folio ya fue enviado. Solo administración puede abrir una corrección.",
      409,
    );
  }
  if (!folio) {
    const folioCode = `RTD-${context.assignment.municipality_code}-${context.assignment.jrv_number}-${electionType}-${randomHex(3).toUpperCase()}`;
    const { data: created, error } = await service
      .from("day_d_rtd_folios")
      .insert({
        folio: folioCode,
        campaign_id: context.campaign.id,
        municipality_code: context.assignment.municipality_code,
        assignment_id: context.assignment.id,
        center_id: context.assignment.center_id,
        jrv_number: context.assignment.jrv_number,
        fiscal_person_id: context.assignment.fiscal_person_id,
        election_type: electionType,
        catalog_version: version,
        is_demo: context.campaign.is_demo === true,
        is_test: context.grant.test_mode === true,
      })
      .select("*")
      .single();
    if (error) throw error;
    folio = created;
  }
  const { data: saved, error: saveError } = await service
    .from("day_d_rtd_folios")
    .update({
      catalog_version: version,
      null_votes: nullVotes,
      blank_votes: blankVotes,
      total_digitized: totalDigitized,
      voters_present: votersPresent,
      ballots_received: ballotsReceived,
      ballots_unused: ballotsUnused,
      observations: String(payload.observations ?? "")
        .trim()
        .slice(0, 2000),
      inconsistency: inconsistencies.join(" "),
    })
    .eq("id", folio.id)
    .eq("status", "BORRADOR")
    .select("*")
    .single();
  if (saveError) throw saveError;
  await service.from("day_d_rtd_votes").delete().eq("rtd_folio_id", folio.id);
  if (normalizedVotes.length) {
    const { error: votesError } = await service.from("day_d_rtd_votes").insert(
      normalizedVotes.map((item) => ({
        rtd_folio_id: folio.id,
        option_code: item.code,
        option_label: item.label,
        votes: item.votes,
      })),
    );
    if (votesError) throw votesError;
  }
  if (action === "SUBMIT") {
    if (submissionKey.length < 12)
      throw apiError("Identificador de envío inválido.");
    const { count: filesCount } = await service
      .from("day_d_evidence")
      .select("id", { count: "exact", head: true })
      .eq("subject_type", "RTD")
      .eq("subject_id", folio.id);
    if (!filesCount)
      throw apiError("Adjunta la fotografía del acta antes de enviar el RTD.");
    if (
      normalizedVotes.length !== catalog.length ||
      votersPresent === null ||
      ballotsReceived === null ||
      ballotsUnused === null
    )
      throw apiError(
        "Completa todas las cifras del acta antes de enviar el RTD.",
      );
    if (inconsistencies.length)
      throw apiError(
        "El RTD no puede enviarse hasta que ambos controles del acta cuadren.",
        409,
      );
    const snapshot = {
      electionType,
      catalogVersion: version,
      votes: normalizedVotes,
      validVotes,
      nullVotes,
      blankVotes,
      totalDigitized,
      votersPresent,
      ballotsReceived,
      ballotsUnused,
    };
    const { data: submitted, error: submitError } = await service
      .from("day_d_rtd_folios")
      .update({
        status: "ENVIADO",
        submission_key: submissionKey,
        submitted_at: now,
      })
      .eq("id", folio.id)
      .eq("status", "BORRADOR")
      .select("*")
      .single();
    if (submitError) throw submitError;
    await service.from("day_d_rtd_history").insert({
      rtd_folio_id: folio.id,
      version: saved.version,
      action: "ENVIADO_POR_FISCAL",
      author_type: "FISCAL",
      author_id: String(context.assignment.fiscal_person_id),
      snapshot,
    });
    await service
      .from("day_d_jrv_assignments")
      .update({
        rtd_submitted: true,
        rtd_submitted_at: now,
        last_fiscal_sync_at: now,
      })
      .eq("id", context.assignment.id);
    await audit(
      service,
      context,
      "RTD_SUBMITTED",
      "RTD_FOLIO",
      String(folio.id),
      {
        electionType,
        totalDigitized,
        testMode: context.grant.test_mode === true,
      },
    );
    if (!submitted.is_test)
      await service.rpc("radar_fiscal_publish_rtd_v1", {
        p_folio_id: submitted.id,
      });
    return response(
      request,
      {
        folio: { id: String(submitted.id), status: submitted.status },
        serverConfirmedAt: now,
      },
      201,
    );
  }
  await audit(
    service,
    context,
    "RTD_DRAFT_SAVED",
    "RTD_FOLIO",
    String(folio.id),
    { electionType, totalDigitized },
  );
  return response(request, {
    folio: { id: String(saved.id), status: saved.status },
    serverConfirmedAt: now,
  });
}

async function uploadEvidence(
  request: Request,
  service: SupabaseClient,
  context: SessionContext,
  subjectType: "INCIDENT" | "RTD",
  subjectId?: string,
) {
  const form = await readBoundedForm(request, MAX_FILE_SIZE + 256 * 1024);
  const candidate = form.get("file");
  if (!(candidate instanceof File) || !candidate.size)
    throw apiError("Selecciona un archivo.");
  if (candidate.size > MAX_FILE_SIZE)
    throw apiError("El archivo supera el límite de 12 MB.");
  const mime = candidate.type || "application/octet-stream";
  if (
    !new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]).has(
      mime,
    )
  )
    throw apiError("Usa una fotografía JPG, PNG, WEBP o un PDF.");
  let record: JsonRecord | null = null;
  if (subjectType === "INCIDENT") {
    if (!subjectId) throw apiError("Incidencia requerida.");
    const { data } = await service
      .from("day_d_incidents")
      .select("*")
      .eq("id", subjectId)
      .eq("assignment_id", context.assignment.id)
      .maybeSingle();
    record = data;
  } else {
    const electionType = String(form.get("electionType") ?? "").toUpperCase();
    if (!ELECTION_TYPES.has(electionType))
      throw apiError("Elección requerida.");
    const { data } = await service
      .from("day_d_rtd_folios")
      .select("*")
      .eq("campaign_id", context.campaign.id)
      .eq("jrv_number", context.assignment.jrv_number)
      .eq("election_type", electionType)
      .maybeSingle();
    record = data;
    subjectId = data?.id;
  }
  if (!record || !subjectId)
    throw apiError("El expediente no existe o no pertenece a esta JRV.", 404);
  if (subjectType === "RTD" && record.status !== "BORRADOR")
    throw apiError("El RTD ya fue enviado y no admite nuevos archivos.", 409);
  const bytes = new Uint8Array(await candidate.arrayBuffer());
  const digest = await sha256(bytes);
  const extension =
    mime === "application/pdf"
      ? "pdf"
      : mime.split("/")[1].replace("jpeg", "jpg");
  const objectPath = [
    context.assignment.municipality_code,
    String(context.campaign.id),
    String(context.assignment.center_id),
    String(context.assignment.jrv_number),
    subjectType.toLowerCase(),
    `${subjectId}-${context.assignment.id}-${digest}.${extension}`,
  ]
    .map(safeName)
    .join("/");
  const findExisting = async () => {
    const { data, error } = await service.from("day_d_evidence").select("*")
      .eq("object_path", objectPath).eq("campaign_id", context.campaign.id)
      .eq("assignment_id", context.assignment.id).maybeSingle();
    if (error) throw error;
    return data;
  };
  const saved = await persistEvidenceOnce({
    find: findExisting,
    upload: () => service.storage.from(EVIDENCE_BUCKET).upload(objectPath, bytes, {
      contentType: mime, upsert: false, metadata: { sha256: digest },
    }),
    insert: () => service.from("day_d_evidence").insert({
      campaign_id: context.campaign.id, assignment_id: context.assignment.id,
      subject_type: subjectType, subject_id: subjectId, object_path: objectPath,
      file_name: candidate.name.slice(0, 240), mime_type: mime,
      file_size: candidate.size, sha256: digest,
    }).select("*").single(),
  });
  const evidence = saved.row;
  if (saved.duplicate) return response(request, {
    file: { id: String(evidence.id), name: evidence.file_name }, duplicateNeutralized: true,
  });
  await audit(service, context, "EVIDENCE_UPLOADED", subjectType, subjectId, {
    size: candidate.size,
    mime,
  });
  return response(
    request,
    { file: { id: String(evidence.id), name: evidence.file_name } },
    201,
  );
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS")
    return new Response("ok", { headers: corsHeaders(request) });
  if (!allowedOrigin(request))
    return response(request, { error: "Origen no permitido." }, 403);
  const service = serviceClient();
  const path = routePath(request);
  try {
    if (path === "/api/fiscal/auth" && request.method === "POST")
      return await exchangeAccess(request, service);
    if (path === "/api/fiscal/auth" && request.method === "DELETE")
      return await logout(request, service);
    const context = await requireSession(request, service);
    if (path === "/api/fiscal/me" && request.method === "GET")
      return await portalMe(request, service, context);
    if (path === "/api/fiscal/bootstrap" && request.method === "GET") {
      const [meResponse, incidentsResponse, rtdResponse] = await Promise.all([
        portalMe(request, service, context),
        incidentList(request, service, context),
        rtdList(request, service, context),
      ]);
      const [me, incidentPayload, rtdPayload] = await Promise.all([
        meResponse.json(),
        incidentsResponse.json(),
        rtdResponse.json(),
      ]);
      return response(request, {
        ...asObject(me),
        incidents: asObject(incidentPayload).incidents ?? [],
        folios: asObject(rtdPayload).folios ?? [],
      });
    }
    if (path === "/api/fiscal/status" && request.method === "POST")
      return await updateStatus(request, service, context);
    if (path === "/api/fiscal/incidents" && request.method === "GET")
      return await incidentList(request, service, context);
    if (path === "/api/fiscal/incidents" && request.method === "POST")
      return await createIncident(request, service, context);
    const incidentNote = path.match(
      /^\/api\/fiscal\/incidents\/([0-9a-f-]+)\/updates$/i,
    );
    if (incidentNote && request.method === "POST")
      return await addIncidentNote(request, service, context, incidentNote[1]);
    const incidentFile = path.match(
      /^\/api\/fiscal\/incidents\/([0-9a-f-]+)\/files$/i,
    );
    if (incidentFile && request.method === "POST")
      return await uploadEvidence(
        request,
        service,
        context,
        "INCIDENT",
        incidentFile[1],
      );
    if (path === "/api/fiscal/rtd" && request.method === "GET")
      return await rtdList(request, service, context);
    if (path === "/api/fiscal/rtd" && request.method === "POST")
      return await saveRtd(request, service, context);
    if (path === "/api/fiscal/rtd/files" && request.method === "POST")
      return await uploadEvidence(request, service, context, "RTD");
    return response(request, { error: "Ruta no encontrada." }, 404);
  } catch (error) {
    const status =
      typeof (error as { status?: unknown }).status === "number"
        ? Number((error as { status: number }).status)
        : 500;
    const safeStatus = status >= 400 && status < 600 ? status : 500;
    const message =
      safeStatus === 500
        ? "No se pudo completar la operación."
        : String((error as Error).message || "Solicitud rechazada.");
    console.error("fiscal-api", path, error);
    return response(request, { error: message }, safeStatus);
  }
});

