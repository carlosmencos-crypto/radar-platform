import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type AdminRole = "super_admin" | "data_ops" | "qa" | "support" | "commercial_ops" | "rtd_ops";

const ADMIN_ROLES = new Set<AdminRole>([
  "super_admin", "data_ops", "qa", "support", "commercial_ops", "rtd_ops",
]);

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<string>> = {
  super_admin: new Set(["*"]),
  data_ops: new Set(["snapshot:read", "data:preview", "pulse:draft"]),
  qa: new Set(["snapshot:read", "data:approve", "data:publish", "data:rollback", "pulse:approve", "qa:write"]),
  support: new Set(["snapshot:read", "support:open", "support:close"]),
  commercial_ops: new Set(["snapshot:read", "contracts:write", "campaigns:write"]),
  rtd_ops: new Set(["snapshot:read", "rtd:read"]),
};

const DEFAULT_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://carlosmencos-crypto.github.io",
  "https://radar-superadmin-v70-qa.netlify.app",
]);

function allowedOrigins() {
  const configured = (Deno.env.get("RADAR_ADMIN_ALLOWED_ORIGINS") ?? "")
    .split(",").map((value) => value.trim()).filter(Boolean);
  return new Set([...DEFAULT_ORIGINS, ...configured]);
}

function corsHeaders(req: Request) {
  const origin = req.headers.get("Origin") ?? "";
  const allowed = allowedOrigins();
  return {
    "Access-Control-Allow-Origin": allowed.has(origin) ? origin : "https://carlosmencos-crypto.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-request-id",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function response(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

function requiredEnv(name: string) {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function publishableKey() {
  const direct = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")?.trim();
  if (direct) return direct;
  const legacy = Deno.env.get("SUPABASE_ANON_KEY")?.trim();
  if (legacy) return legacy;
  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")?.trim();
  if (raw) {
    const parsed = JSON.parse(raw) as Record<string, string>;
    if (parsed.default) return parsed.default;
  }
  throw new Error("Missing server configuration: Supabase publishable key");
}

function jwtPayload(token: string) {
  const payload = token.split(".")[1];
  if (!payload) return {} as Record<string, unknown>;
  const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asString(value: unknown, name: string, required = true) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (required && !normalized) throw new Error(`${name} is required`);
  return normalized;
}

function hasRolePermission(role: AdminRole, permission: string) {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed.has("*") || allowed.has(permission);
}

function hasGrantedPermission(context: Record<string, unknown>, permission: string) {
  const permissions = Array.isArray(context.permissions) ? context.permissions.map(String) : [];
  return permissions.includes("*") || permissions.includes(permission);
}

function assertPermission(role: AdminRole, context: Record<string, unknown>, permission: string) {
  if (!hasRolePermission(role, permission) || !hasGrantedPermission(context, permission)) {
    throw Object.assign(new Error("Administrative permission denied"), { status: 403 });
  }
}

function assertTerritorialScope(context: Record<string, unknown>, payload: Record<string, unknown>) {
  if (context.user_role === "super_admin") return;
  const municipality = typeof payload.municipality_code === "string" ? payload.municipality_code : null;
  const department = typeof payload.department_code === "string"
    ? payload.department_code
    : municipality?.slice(0, 2) ?? null;
  const campaign = typeof payload.campaign_id === "string" ? payload.campaign_id : null;
  const scopes = Array.isArray(context.scopes) ? context.scopes.map(asObject) : [];
  const allowed = scopes.some((scope) => {
    if (scope.country_code !== "GT") return false;
    if (scope.campaign_id && scope.campaign_id !== campaign) return false;
    if (scope.municipality_code && scope.municipality_code !== municipality) return false;
    if (scope.department_code && scope.department_code !== department) return false;
    return true;
  });
  if (!allowed) throw Object.assign(new Error("Administrative territorial scope denied"), { status: 403 });
}

function sanitizeUser(user: Record<string, unknown>, includeEmail: boolean) {
  const factors = Array.isArray(user.factors) ? user.factors.map(asObject) : [];
  return {
    id: String(user.id ?? ""),
    email: includeEmail ? String(user.email ?? "") : null,
    platform_role: String(asObject(user.app_metadata).platform_role ?? ""),
    is_anonymous: Boolean(user.is_anonymous),
    banned_until: user.banned_until ?? null,
    last_sign_in_at: user.last_sign_in_at ?? null,
    created_at: user.created_at ?? null,
    mfa_enrolled: factors.some((factor) => factor.status === "verified"),
  };
}

function recordWithinScope(context: Record<string, unknown>, record: Record<string, unknown>) {
  if (context.user_role === "super_admin") return true;
  const municipality = typeof record.municipality_code === "string" ? record.municipality_code : null;
  const department = typeof record.department_code === "string" ? record.department_code : municipality?.slice(0, 2) ?? null;
  const campaign = typeof record.campaign_id === "string" ? record.campaign_id : typeof record.id === "string" && record.slug ? record.id : null;
  const scopes = Array.isArray(context.scopes) ? context.scopes.map(asObject) : [];
  return scopes.some((scope) => {
    if (scope.country_code !== String(record.country_code ?? "GT")) return false;
    if (scope.campaign_id && scope.campaign_id !== campaign) return false;
    if (scope.municipality_code && scope.municipality_code !== municipality) return false;
    if (scope.department_code && scope.department_code !== department) return false;
    return true;
  });
}

function scopedSnapshot(raw: Record<string, unknown>, context: Record<string, unknown>, role: AdminRole) {
  if (role === "super_admin") return raw;
  const filter = (key: string) => (Array.isArray(raw[key]) ? raw[key] : []).map(asObject).filter((record) => recordWithinScope(context, record));
  const municipalities = filter("municipalities");
  const campaigns = filter("campaigns");
  const contracts = filter("contracts");
  const publicationBatches = filter("publication_batches");
  const batchIds = new Set(publicationBatches.map((batch) => String(batch.id ?? "")));
  const publicationIssues = (Array.isArray(raw.publication_issues) ? raw.publication_issues : []).map(asObject)
    .filter((issue) => batchIds.has(String(issue.batch_id ?? "")));
  const pulse = filter("pulse_measurements");
  const departments = new Set(municipalities.map((item) => item.department_code));
  return {
    ...raw,
    national: {
      municipalities: municipalities.length,
      departments: departments.size,
      municipalities_with_17_layers: municipalities.filter((item) => Number(item.canonical_layers_present) === 17).length,
      active_campaigns: campaigns.filter((item) => item.status === "active" && !item.is_demo).length,
      protected_contracts: contracts.filter((item) => ["RESERVED", "ACTIVE", "SUSPENDED"].includes(String(item.status))).length,
      active_profiles: null,
      last_data_update: municipalities.map((item) => item.data_updated_at).filter(Boolean).sort().at(-1) ?? null,
    },
    municipalities,
    vertical_qa: filter("vertical_qa"),
    layers: [],
    campaigns,
    contracts,
    campaign_health: filter("campaign_health"),
    publication_batches: publicationBatches,
    publication_issues: publicationIssues,
    pulse_measurements: pulse,
    publication_states: Object.fromEntries(Array.from(new Set(publicationBatches.map((item) => String(item.state)))).map((state) => [state, publicationBatches.filter((item) => item.state === state).length])),
    pulse_states: Object.fromEntries(Array.from(new Set(pulse.map((item) => String(item.status)))).map((state) => [state, pulse.filter((item) => item.status === state).length])),
    rtd: filter("rtd"),
    audit: filter("audit"),
    support: filter("support"),
    qa_runs: role === "qa" ? raw.qa_runs : [],
    deployments: role === "qa" ? raw.deployments : [],
  };
}

function hexDigest(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: Uint8Array | string) {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return hexDigest(await crypto.subtle.digest("SHA-256", bytes));
}

function safePathPart(value: string) {
  return value.normalize("NFKD").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 100) || "file";
}

function prevalidateFile(file: File, bytes: Uint8Array) {
  const issues: Array<Record<string, Json>> = [];
  const lowerName = file.name.toLowerCase();
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let rowCount = 0;
  let format = "unknown";
  if (lowerName.endsWith(".json") || file.type === "application/json") {
    format = "json";
    try {
      const parsed = JSON.parse(text) as unknown;
      const rows = Array.isArray(parsed) ? parsed : Array.isArray(asObject(parsed).rows) ? asObject(parsed).rows as unknown[] : null;
      if (!rows) issues.push({ severity: "BLOCKER", issue_code: "JSON_ROWS_REQUIRED", message: "El JSON debe ser un arreglo o contener un arreglo rows." });
      rowCount = rows?.length ?? 0;
    } catch {
      issues.push({ severity: "BLOCKER", issue_code: "JSON_INVALID", message: "El archivo no contiene JSON válido." });
    }
  } else if (lowerName.endsWith(".csv") || file.type === "text/csv") {
    format = "csv";
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length > 0);
    const headers = (lines[0] ?? "").split(",").map((header) => header.trim());
    rowCount = Math.max(lines.length - 1, 0);
    if (!headers.length || headers.some((header) => !header)) issues.push({ severity: "BLOCKER", issue_code: "CSV_HEADER_INVALID", message: "El encabezado CSV contiene campos vacíos." });
    if (new Set(headers).size !== headers.length) issues.push({ severity: "BLOCKER", issue_code: "CSV_HEADER_DUPLICATE", message: "El encabezado CSV contiene columnas duplicadas." });
    issues.push({ severity: "INFO", issue_code: "CSV_STRUCTURAL_PREVIEW", message: "El conteo CSV es estructural; la validación de esquema sigue siendo obligatoria antes de aprobar." });
  } else {
    issues.push({ severity: "BLOCKER", issue_code: "FILE_TYPE_UNSUPPORTED", message: "Solo se aceptan archivos CSV o JSON en este vertical QA." });
  }
  if (!rowCount) issues.push({ severity: "BLOCKER", issue_code: "NO_DATA_ROWS", message: "El archivo no contiene filas de datos." });
  return { format, rowCount, issues };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const requestId = req.headers.get("x-request-id") ?? crypto.randomUUID();

  try {
    const authorization = req.headers.get("Authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return response(req, { error: "AUTH_REQUIRED", request_id: requestId }, 401);
    const token = authorization.slice(7).trim();
    const url = requiredEnv("SUPABASE_URL");
    const userClient = createClient(url, publishableKey(), {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser(token);
    if (userError || !userData.user) return response(req, { error: "AUTH_INVALID", request_id: requestId }, 401);

    const roleValue = userData.user.app_metadata?.platform_role;
    if (typeof roleValue !== "string" || !ADMIN_ROLES.has(roleValue as AdminRole)) {
      return response(req, { error: "ADMIN_ROLE_REQUIRED", request_id: requestId }, 403);
    }
    const role = roleValue as AdminRole;
    if (jwtPayload(token).aal !== "aal2") {
      return response(req, { error: "MFA_AAL2_REQUIRED", request_id: requestId }, 403);
    }

    const service = createClient(url, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: contextData, error: contextError } = await service.rpc("radar_admin_operator_context_v1", {
      p_actor_user_id: userData.user.id,
      p_actor_role: role,
    });
    if (contextError || !contextData) throw Object.assign(new Error("Administrative context unavailable"), { status: 403 });
    const context = asObject(contextData);
    const urlObject = new URL(req.url);
    let action = urlObject.searchParams.get("action") ?? "snapshot";
    let input: Record<string, unknown> = {};
    let uploadedFile: File | null = null;
    if (req.method === "POST") {
      if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
        const form = await req.formData();
        action = asString(form.get("action"), "action");
        const rawInput = asString(form.get("input"), "input");
        input = asObject(JSON.parse(rawInput));
        const candidate = form.get("file");
        uploadedFile = candidate instanceof File ? candidate : null;
      } else {
        const body = asObject(await req.json());
        action = asString(body.action, "action");
        input = asObject(body.input);
      }
    } else if (req.method !== "GET") {
      return response(req, { error: "METHOD_NOT_ALLOWED", request_id: requestId }, 405);
    }

    if (action === "national_rtd") {
      assertPermission(role, context, "rtd:read");
      if (role !== "super_admin") throw Object.assign(new Error("Consolidado exclusivo de superadministración"), { status: 403 });
      const { data, error } = await service.rpc("radar_admin_national_rtd_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_input: input });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }
    if (action === "snapshot") {
      assertPermission(role, context, "snapshot:read");
      const secondCode = urlObject.searchParams.get("second_municipality_code") ?? String(input.second_municipality_code ?? "1901");
      const { data, error } = await service.rpc("radar_admin_snapshot_v1", {
        p_actor_user_id: userData.user.id,
        p_actor_role: role,
        p_second_municipality_code: secondCode,
      });
      if (error) throw error;
      let users: unknown[] = [];
      let campaignMembers: unknown[] = [];
      if (role === "super_admin") {
        for (let page = 1; ; page++) {
          const { data: usersData, error: usersError } = await service.auth.admin.listUsers({ page, perPage: 1000 });
          if (usersError) throw usersError;
          users.push(...usersData.users.map((user) => sanitizeUser(user as unknown as Record<string, unknown>, true)));
          if (usersData.users.length < 1000) break;
        }
        for (let offset = 0; ; offset += 1000) {
          const { data: members, error: membersError } = await service.from("campaign_members").select("campaign_id,user_id,member_role,created_at").order("campaign_id").order("user_id").range(offset, offset + 999);
          if (membersError) throw membersError;
          campaignMembers.push(...(members ?? []));
          if (!members || members.length < 1000) break;
        }
      }
      let clientAccounts: unknown[] = [];
      let sharedContent: unknown[] = [];
      if (role === "super_admin") {
        const { data: accounts, error } = await service.rpc("radar_admin_clients_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_operation: "list", p_input: {} });
        if (error) throw error;
        clientAccounts = accounts ?? [];
        const { data: content, error: contentError } = await service.rpc("radar_admin_content_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_operation: "list", p_input: {} });
        if (contentError) throw contentError;
        sharedContent = content ?? [];
      }
      const visibleSnapshot = scopedSnapshot(asObject(data), context, role);
      return response(req, { data: { ...visibleSnapshot, users, campaign_members: campaignMembers, client_accounts: clientAccounts, shared_content: sharedContent, operator_context: context }, request_id: requestId });
    }

    if (["save_notice", "publish_content", "archive_content", "upload_resource"].includes(action)) {
      assertPermission(role, context, "users:write");
      let path: string | null = null;
      if (action === "upload_resource") {
        if (!uploadedFile || !uploadedFile.size || uploadedFile.size > 25 * 1024 * 1024) throw new Error("Selecciona un archivo de hasta 25 MB");
        if (!/\.(pdf|docx|xlsx|pptx|png|jpg|jpeg|webp|mp4)$/i.test(uploadedFile.name)) throw new Error("Formato no admitido. Usa PDF, Office, imagen o MP4.");
        path = `${crypto.randomUUID()}/${safePathPart(uploadedFile.name)}`;
        const { error } = await service.storage.from("radar-shared-resources").upload(path, uploadedFile, { contentType: uploadedFile.type || "application/octet-stream" });
        if (error) throw error;
        input = { ...input, kind: "resource", storage_path: path, file_name: uploadedFile.name };
      }
      if (action === "save_notice") input = { ...input, kind: "notice" };
      const operation = action === "publish_content" ? "publish" : action === "archive_content" ? "archive" : "save";
      const { data, error } = await service.rpc("radar_admin_content_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_operation: operation, p_input: input });
      if (error) { if (path) await service.storage.from("radar-shared-resources").remove([path]); throw error; }
      return response(req, { data, request_id: requestId });
    }
    if (action === "purge_campaign") {
      assertPermission(role, context, "users:write");
      if (role !== "super_admin") throw Object.assign(new Error("Solo superadministradores"), { status: 403 });
      if (!allowedOrigins().has(req.headers.get("Origin") ?? "")) throw new Error("Origen no permitido");
      const { data, error } = await service.rpc("radar_admin_purge_campaign_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_input: input });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }
    if (["client_limit", "reactivate_client", "reset_demo"].includes(action)) {
      assertPermission(role, context, "users:write");
      const operation = action === "client_limit" ? "limit" : action === "reactivate_client" ? "reactivate" : "reset_demo";
      const { data, error } = await service.rpc("radar_admin_clients_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_operation: operation, p_input: input });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }
    if (action === "onboard_client") {
      assertPermission(role, context, "users:write");
      if (!allowedOrigins().has(req.headers.get("Origin") ?? "")) throw new Error("Origen no permitido");
      const { data, error } = await service.rpc("radar_admin_clients_v1", { p_actor_user_id: userData.user.id, p_actor_role: role, p_operation: "onboard", p_input: input });
      if (error) throw error;
      input = { ...input, campaign_id: data.campaign_id, member_role: "campaign_admin", reason: "Administrador principal asignado durante contratación" };
      action = "invite_campaign_member";
    }
    if (action === "assign_campaign_member" || action === "invite_campaign_member") {
      assertPermission(role, context, "users:write");
      if (role !== "super_admin") throw new Error("Solo superadministradores");
      const campaignId = asString(input.campaign_id, "campaign_id");
      const reason = asString(input.reason, "reason");
      const memberRole = input.member_role === null ? null : asString(input.member_role, "member_role");
      const { data: campaign, error: campaignError } = await service.from("campaigns").select("id,is_demo,municipality_id").eq("id", campaignId).single();
      if (campaignError || !campaign) throw new Error("Campaña inexistente");
      const validRoles = campaign.is_demo ? ["demo_admin", "demo_viewer"] : ["campaign_admin", "campaign_editor", "campaign_viewer"];
      if (memberRole !== null && !validRoles.includes(memberRole)) throw new Error("Rol incompatible con la campaña");
      let targetId = String(input.user_id ?? "");
      if (action === "invite_campaign_member") {
        if (campaign.is_demo) throw new Error("Las invitaciones están habilitadas para campañas reales. Las demos requieren su flujo de acceso específico.");
        if (!memberRole) throw new Error("Selecciona un rol");
        const email = asString(input.email, "email").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Correo inválido");
        // Resolve existing accounts without changing their password or platform privileges.
        let existing;
        for (let page = 1; ; page++) {
          const { data: listed, error } = await service.auth.admin.listUsers({ page, perPage: 1000 });
          if (error) throw error;
          existing = listed.users.find((u) => u.email?.toLowerCase() === email);
          if (existing || listed.users.length < 1000) break;
        }
        if (existing) targetId = existing.id;
        else {
          const { data: municipality, error } = await service.from("municipalities").select("municipality_code").eq("id", campaign.municipality_id).single();
          if (error) throw error;
          const origin = req.headers.get("Origin") ?? "";
          if (!allowedOrigins().has(origin)) throw new Error("Origen de invitación no permitido");
          const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
            data: { display_name: asString(input.display_name, "display_name") },
            redirectTo: `${origin}/acceso?next=${encodeURIComponent(`/municipio/${municipality.municipality_code}`)}`,
          });
          if (inviteError || !invitation.user) throw inviteError ?? new Error("No se pudo enviar la invitación");
          targetId = invitation.user.id;
        }
      }
      const { data, error } = await service.rpc("radar_admin_campaign_member_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role, p_campaign_id: campaignId,
        p_user_id: asString(targetId, "user_id"), p_member_role: memberRole, p_reason: reason,
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "invite_user") {
      assertPermission(role, context, "users:write");
      const email = asString(input.email, "email").toLowerCase();
      const targetRole = asString(input.platform_role, "platform_role") as AdminRole;
      if (!ADMIN_ROLES.has(targetRole)) throw new Error("Invalid platform_role");
      const requestOrigin = req.headers.get("Origin") ?? "";
      const redirectTo = allowedOrigins().has(requestOrigin)
        ? `${requestOrigin}/acceso?next=/admin`
        : undefined;
      const { data: invitation, error: inviteError } = await service.auth.admin.inviteUserByEmail(email, {
        data: { display_name: asString(input.display_name, "display_name", false) },
        redirectTo,
      });
      if (inviteError || !invitation.user) throw inviteError ?? new Error("Invitation failed");
      const { error: metadataError } = await service.auth.admin.updateUserById(invitation.user.id, {
        app_metadata: { ...invitation.user.app_metadata, platform_role: targetRole },
      });
      if (metadataError) throw metadataError;
      const { error: profileError } = await service.from("profiles").upsert({
        user_id: invitation.user.id,
        display_name: asString(input.display_name, "display_name", false) || null,
        platform_role: targetRole,
        is_active: true,
      }, { onConflict: "user_id" });
      if (profileError) throw profileError;
      const { data: scopeData, error: scopeError } = await service.rpc("radar_admin_assign_operator_scope_v1", {
        p_actor_user_id: userData.user.id,
        p_actor_role: role,
        p_target_user_id: invitation.user.id,
        p_target_role: targetRole,
        p_scope: asObject(input.scope),
        p_permissions: Array.isArray(input.permissions) ? input.permissions.map(String) : [],
        p_reason: asString(input.reason, "reason"),
      });
      if (scopeError) throw scopeError;
      return response(req, { data: { user: sanitizeUser(invitation.user as unknown as Record<string, unknown>, true), scope: scopeData }, request_id: requestId }, 201);
    }

    if (action === "set_user_status") {
      assertPermission(role, context, "users:write");
      const targetUserId = asString(input.user_id, "user_id");
      const isActive = input.is_active === true;
      const reason = asString(input.reason, "reason");
      const { data, error } = await service.rpc("radar_admin_set_profile_state_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_target_user_id: targetUserId, p_is_active: isActive, p_reason: reason,
      });
      if (error) throw error;
      const { error: authUpdateError } = await service.auth.admin.updateUserById(targetUserId, {
        ban_duration: isActive ? "none" : "876000h",
      });
      if (authUpdateError) throw authUpdateError;
      if (!isActive) {
        const { error: revokeError } = await service.rpc("radar_admin_revoke_user_sessions_v1", {
          p_actor_user_id: userData.user.id, p_actor_role: role,
          p_target_user_id: targetUserId, p_reason: reason,
        });
        if (revokeError) throw revokeError;
      }
      return response(req, { data, request_id: requestId });
    }

    if (action === "release_contract") {
      assertPermission(role, context, "users:write");
      const { data, error } = await service.rpc("radar_admin_release_contract_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_contract_id: asString(input.contract_id, "contract_id"),
        p_confirmation: asString(input.confirmation, "confirmation"), p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "reserve_contract") {
      assertPermission(role, context, "contracts:write");
      assertTerritorialScope(context, input);
      const { data, error } = await service.rpc("radar_admin_reserve_contract_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_municipality_code: asString(input.municipality_code, "municipality_code"),
        p_organization_id: asString(input.organization_id, "organization_id"),
        p_campaign_id: input.campaign_id || null,
        p_contract_ref: asString(input.contract_ref, "contract_ref"),
        p_valid_from: asString(input.valid_from, "valid_from"),
        p_valid_until: input.valid_until || null,
        p_status: asString(input.status, "status"),
        p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "create_campaign") {
      assertPermission(role, context, "campaigns:write");
      assertTerritorialScope(context, input);
      const { data, error } = await service.rpc("radar_admin_create_campaign_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_municipality_code: asString(input.municipality_code, "municipality_code"),
        p_organization_id: asString(input.organization_id, "organization_id"),
        p_name: asString(input.name, "name"), p_slug: asString(input.slug, "slug"),
        p_status: asString(input.status, "status"), p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "register_source") {
      assertPermission(role, context, "data:preview");
      const source = { ...input };
      if (typeof source.lineage === "string") source.lineage = JSON.parse(source.lineage || "{}");
      const { data, error } = await service.rpc("radar_admin_register_source_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_source: source, p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "preview_publication") {
      assertPermission(role, context, "data:preview");
      assertTerritorialScope(context, input);
      const { data, error } = await service.rpc("radar_admin_create_publication_preview_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_batch: input, p_issues: Array.isArray(input.issues) ? input.issues : [],
        p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "upload_publication") {
      assertPermission(role, context, "data:preview");
      assertTerritorialScope(context, input);
      if (!uploadedFile || !uploadedFile.size) throw new Error("Publication file is required");
      if (uploadedFile.size > 25 * 1024 * 1024) throw new Error("Publication file exceeds 25 MB");
      const datasetKey = asString(input.dataset_key, "dataset_key");
      const sourceId = asString(input.source_id, "source_id");
      const scopeType = asString(input.scope_type, "scope_type").toUpperCase();
      if (!new Set(["MUNICIPALITY", "DEPARTMENT", "NATIONAL"]).has(scopeType)) throw new Error("Invalid scope_type");
      const municipality = asString(input.municipality_code, "municipality_code", false) || null;
      const department = asString(input.department_code, "department_code", false) || null;
      if (scopeType === "MUNICIPALITY" && (!municipality?.match(/^\d{4}$/) || department !== municipality.slice(0, 2))) throw new Error("Municipal scope mismatch");
      if (scopeType === "DEPARTMENT" && (!department?.match(/^\d{2}$/) || municipality)) throw new Error("Department scope mismatch");
      if (scopeType === "NATIONAL" && (department || municipality)) throw new Error("National scope cannot include department or municipality");

      const bytes = new Uint8Array(await uploadedFile.arrayBuffer());
      const fileSha256 = await sha256(bytes);
      const preview = prevalidateFile(uploadedFile, bytes);
      const scopePath = municipality ?? department ?? "GT";
      const storagePath = [
        scopeType.toLowerCase(), safePathPart(scopePath), safePathPart(sourceId),
        new Date().toISOString().slice(0, 10), `${crypto.randomUUID()}-${safePathPart(uploadedFile.name)}`,
      ].join("/");
      const { error: uploadError } = await service.storage.from("radar-admin-staging").upload(storagePath, bytes, {
        contentType: uploadedFile.type || "application/octet-stream", upsert: false,
        metadata: { sha256: fileSha256, uploader: userData.user.id },
      });
      if (uploadError) throw uploadError;
      const batch = {
        ...input,
        scope_type: scopeType,
        country_code: "GT",
        department_code: department,
        municipality_code: municipality,
        storage_path: storagePath,
        file_sha256: fileSha256,
        row_count: preview.rowCount,
        preview_hash: await sha256(`${fileSha256}:${JSON.stringify(input)}`),
        validation_summary: { format: preview.format, file_size: uploadedFile.size, issue_count: preview.issues.length },
        release_manifest: { file_name: uploadedFile.name, content_type: uploadedFile.type, format: preview.format, file_size: uploadedFile.size },
      };
      const { data, error } = await service.rpc("radar_admin_create_publication_preview_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_batch: batch, p_issues: preview.issues,
        p_reason: asString(input.reason, "reason"),
      });
      if (error) {
        await service.storage.from("radar-admin-staging").remove([storagePath]);
        throw error;
      }
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "transition_publication") {
      const target = asString(input.target_state, "target_state").toUpperCase();
      assertPermission(role, context, target === "PUBLISHED" ? "data:publish" : "data:approve");
      const { data, error } = await service.rpc("radar_admin_transition_publication_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_batch_id: asString(input.batch_id, "batch_id"), p_target_state: target,
        p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "rollback_release") {
      assertPermission(role, context, "data:rollback");
      const { data, error } = await service.rpc("radar_admin_rollback_release_v1", {
        p_actor_user_id: userData.user.id, p_actor_role: role,
        p_current_release_id: asString(input.current_release_id, "current_release_id"),
        p_restore_release_id: asString(input.restore_release_id, "restore_release_id"),
        p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "save_pulse_draft") {
      assertPermission(role, context, "pulse:draft");
      assertTerritorialScope(context, input);
      const measurement = { ...asObject(input.measurement), status: "BORRADOR" };
      const { data, error } = await service.rpc("radar_admin_save_pulse_v2", {
        p_actor_user_id: userData.user.id,
        p_actor_role: role,
        p_measurement: measurement,
        p_results: Array.isArray(input.results) ? input.results : [],
        p_measurement_id: input.measurement_id || null,
        p_reason: asString(input.reason, "reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "transition_pulse") {
      const target = asString(input.target_status, "target_status").toUpperCase();
      assertPermission(role, context, target === "PREVALIDADA" ? "pulse:draft" : "pulse:approve");
      const { data, error } = await service.rpc("radar_admin_transition_pulse_v1", {
        p_actor_user_id:userData.user.id,p_actor_role:role,
        p_measurement_id:asString(input.measurement_id,"measurement_id"),p_target_status:target,
        p_preview_hash:input.preview_hash || null,p_reason:asString(input.reason,"reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    if (action === "open_support_session") {
      assertPermission(role, context, "support:open");
      assertTerritorialScope(context, input);
      const { data, error } = await service.rpc("radar_admin_open_support_session_v1", {
        p_actor_user_id:userData.user.id,p_actor_role:role,p_ticket_ref:asString(input.ticket_ref,"ticket_ref"),
        p_municipality_code:input.municipality_code || null,p_campaign_id:input.campaign_id || null,
        p_access_mode:asString(input.access_mode,"access_mode"),p_reason:asString(input.reason,"reason"),
        p_expires_at:asString(input.expires_at,"expires_at"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId }, 201);
    }

    if (action === "close_support_session") {
      assertPermission(role, context, "support:close");
      const { data, error } = await service.rpc("radar_admin_close_support_session_v1", {
        p_actor_user_id:userData.user.id,p_actor_role:role,p_session_id:asString(input.session_id,"session_id"),
        p_reason:asString(input.reason,"reason"),
      });
      if (error) throw error;
      return response(req, { data, request_id: requestId });
    }

    return response(req, { error: "UNKNOWN_ACTION", request_id: requestId }, 404);
  } catch (error) {
    const status = typeof (error as { status?: unknown }).status === "number" ? Number((error as { status: number }).status) : 400;
    const safeStatus = status >= 400 && status < 500 ? status : 500;
    const message = safeStatus === 500 ? "Administrative operation failed" : String((error as Error).message || "Request rejected");
    return response(req, { error: message, request_id: requestId }, safeStatus);
  }
});
