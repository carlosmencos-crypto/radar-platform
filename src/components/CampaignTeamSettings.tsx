import { useEffect, useState, type FormEvent } from "react";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
type Member = { user_id: string; email: string; member_role: string };
type Team = { seat_limit: number; members: Member[] };
const roles = [
  { value: "campaign_editor", title: "Editor", description: "Consulta la información y agrega o modifica contactos, actividades y registros de campaña." },
  { value: "campaign_viewer", title: "Consulta", description: "Ve la información disponible del municipio y de la campaña, sin modificar registros." },
];
export function CampaignTeamSettings() {
  const { campaign_id, user_role } = useMunicipalityContext();
  const [team, setTeam] = useState<Team | null>(null);
  const [editing, setEditing] = useState<Member | null>(null);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("campaign_editor");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const allowed = user_role === "municipal_admin";
  async function request(action: string, input: Record<string, unknown> = {}) {
    const token = await ensureRadarAccessToken();
    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/radar-campaign-team`, { method: "POST", headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ action, campaign_id, input }) });
    const result = await response.json();
    if (!response.ok || result.error) throw new Error(result.error || "No se pudo gestionar el equipo");
    return result.data;
  }
  useEffect(() => { if (allowed) void request("list").then(setTeam).catch(e => { setFailed(true); setMessage(e.message); }); }, [campaign_id, allowed]);
  useEffect(() => { if (!open) return; const close = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setOpen(false); }; window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [open, busy]);
  function start(member: Member | null) { setEditing(member); setRole(member?.member_role ?? "campaign_editor"); setMessage(""); setOpen(true); }
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setMessage(""); setFailed(false);
    const values = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await request(editing ? (role === "remove" ? "remove" : "assign") : "invite", { ...values, member_role: role, ...(editing ? { user_id: editing.user_id } : {}) });
      setTeam(await request("list")); setOpen(false); setMessage(role === "remove" ? "Acceso retirado. La información de campaña se conserva." : editing ? "Permisos actualizados." : "Usuario agregado al equipo.");
    } catch (error) { setFailed(true); setMessage(error instanceof Error ? error.message : "No se pudo guardar"); } finally { setBusy(false); }
  }
  if (!allowed) return null;
  const used = team?.members.length ?? 0;
  const remaining = team ? Math.max(0, team.seat_limit - used) : 0;
  return <section className="campaign-team-settings" id="equipo-accesos" aria-labelledby="team-title">
    <article className="campaign-team-card">
      <header className="team-heading"><div><span className="team-eyebrow">TU CAMPAÑA · TU EQUIPO</span><h2 id="team-title">Equipo y accesos</h2><p>Las personas correctas, con el acceso que necesitan.</p></div><button className="team-add" type="button" disabled={!team || remaining === 0 || busy} onClick={() => start(null)}><span aria-hidden="true">＋</span> Agregar usuario</button></header>
      <div className="team-capacity"><div><strong>{team ? used : "—"}<span> / {team?.seat_limit ?? "—"}</span></strong><span>Cuentas utilizadas</span></div><div className="team-capacity-detail"><div className="team-capacity-track" role="meter" aria-label="Cuentas utilizadas" aria-valuenow={used} aria-valuemin={0} aria-valuemax={team?.seat_limit ?? 15}><i style={{ width: `${team ? Math.min(100, used / team.seat_limit * 100) : 0}%` }} /></div><span>{team ? `${remaining} ${remaining === 1 ? "cupo disponible" : "cupos disponibles"} · administrador incluido` : "Cargando equipo…"}</span></div><p>Los accesos temporales de fiscales<br />no consumen cuentas.</p></div>
      <div className="team-list-heading"><span>MIEMBROS DEL EQUIPO</span><span>PERMISOS</span></div>
      {team?.members.map(m => <div key={m.user_id} className="campaign-team-member"><div className="team-person"><span className="team-avatar" aria-hidden="true">{m.email.slice(0, 2).toUpperCase()}</span><span><b>{m.email}</b><small>{m.member_role === "campaign_admin" ? "Responsable del equipo" : "Acceso al municipio asignado"}</small></span></div><div className="team-member-actions"><span className={`team-role-badge ${m.member_role === "campaign_admin" ? "is-admin" : ""}`}>{m.member_role === "campaign_admin" ? "Administrador" : m.member_role === "campaign_editor" ? "Editor" : "Consulta"}</span>{m.member_role !== "campaign_admin" && <button type="button" disabled={busy} onClick={() => start(m)}>Editar</button>}</div></div>)}
      {message && <p className={`team-feedback ${failed ? "is-error" : ""}`} role={failed ? "alert" : "status"}>{message}</p>}
      {open && <form onSubmit={save} className="campaign-team-form"><header><div><span className="team-eyebrow">{editing ? "GESTIONAR ACCESO" : "AMPLIÁ TU EQUIPO"}</span><h3>{editing ? "Editar permisos" : "Agregar una persona"}</h3><p>{editing ? editing.email : "Completá sus datos y elegí cómo participará en la campaña."}</p></div><button type="button" className="team-close" aria-label="Cerrar formulario" disabled={busy} onClick={() => setOpen(false)}>×</button></header>
        {!editing && <div className="team-fields"><label>Nombre completo<input name="display_name" autoComplete="name" placeholder="Ej. Ana López" required maxLength={120} disabled={busy} /></label><label>Correo electrónico<input name="email" type="email" autoComplete="email" placeholder="nombre@correo.com" required disabled={busy} /></label></div>}
        <fieldset className="team-roles"><legend>¿Qué podrá hacer?</legend><div>{roles.map(r => <label key={r.value} className={role === r.value ? "is-selected" : ""}><input type="radio" name="member_role" value={r.value} checked={role === r.value} onChange={() => setRole(r.value)} disabled={busy} /><span><b>{r.title}</b><small>{r.description}</small></span></label>)}</div></fieldset>
        {editing && <label className="team-remove"><input type="radio" name="member_role" value="remove" checked={role === "remove"} onChange={() => setRole("remove")} disabled={busy} /><span><b>Retirar acceso</b><small>Ya no podrá entrar a esta campaña. Sus registros se conservan.</small></span></label>}
        <footer><p>{editing ? "Los cambios aplican al acceso de esta campaña." : "Si es una cuenta nueva, recibirá un enlace para crear su contraseña."}</p><div><button type="button" disabled={busy} onClick={() => setOpen(false)}>Cancelar</button><button className="team-confirm" disabled={busy}>{busy ? "Guardando…" : role === "remove" ? "Retirar acceso" : editing ? "Guardar cambios" : "Agregar al equipo"}</button></div></footer></form>}
      <p className="team-footnote">Para ampliar el cupo o cambiar al administrador principal, contactá a RADAR.</p>
    </article>
  </section>;
}
