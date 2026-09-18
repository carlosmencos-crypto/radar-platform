import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  beginRadarMfaChallenge,
  radarAuthConfigured,
  signInRadar,
  verifyRadarMfa,
  type RadarMfaChallenge,
} from "../data/radarAuth";

function safeNextPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (next && (/^\/municipio\/\d{4}(?:\/[a-z0-9-]+)?(?:\?.*)?$/.test(next) || /^\/admin(?:\/[a-z0-9-]+)?$/.test(next))) return next;
  return "/";
}

export function RadarAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<RadarMfaChallenge | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInRadar(email, password);
      const next = safeNextPath(location.search);
      if (next.startsWith("/admin")) {
        setChallenge(await beginRadarMfaChallenge());
      } else {
        navigate(next, { replace: true });
      }
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_AUTH_FAILED";
      setError(message === "RADAR_AUTH_400" ? "Credenciales inválidas." : "No fue posible validar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  async function submitMfa(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!challenge) return;
    setBusy(true);
    setError(null);
    try {
      await verifyRadarMfa(challenge, mfaCode);
      navigate(safeNextPath(location.search), { replace: true });
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_MFA_FAILED";
      setError(message === "RADAR_MFA_CODE_REQUIRED" ? "Ingresa el código de seis dígitos." : "El código MFA no pudo verificarse.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page page--compact">
      <span className="eyebrow">Acceso RADAR</span>
      <h1>Ingresar a la plataforma</h1>
      <p className="lede">El acceso municipal requiere una sesión válida. Los permisos se verifican nuevamente en Supabase para cada municipio.</p>
      {!radarAuthConfigured() ? (
        <p>El runtime autenticado todavía no está configurado en este entorno.</p>
      ) : challenge ? (
        <form onSubmit={submitMfa} autoComplete="one-time-code">
          <p>Confirma la sesión administrativa con {challenge.friendlyName}.</p>
          <label>
            Código MFA
            <input inputMode="numeric" pattern="[0-9]{6}" maxLength={6} name="mfa_code" autoComplete="one-time-code" value={mfaCode} onChange={(event) => setMfaCode(event.target.value)} required autoFocus />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button className="button" type="submit" disabled={busy}>{busy ? "Verificando…" : "Verificar MFA"}</button>
        </form>
      ) : (
        <form onSubmit={submit} autoComplete="on">
          <label>
            Correo electrónico
            <input type="email" name="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label>
            Contraseña
            <input type="password" name="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button className="button" type="submit" disabled={busy}>{busy ? "Validando…" : "Ingresar"}</button>
        </form>
      )}
    </div>
  );
}
