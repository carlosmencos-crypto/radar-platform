import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  prepareRadarAdminMfa,
  radarAuthConfigured,
  signInRadar,
  verifyRadarMfa,
  type RadarMfaChallenge,
  type RadarMfaEnrollment,
} from "../data/radarAuth";

function safeNextPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (next && (/^\/municipio\/\d{4}(?:\/[a-z0-9-]+)?(?:\?.*)?$/.test(next) || /^\/admin(?:\/[a-z0-9-]+)?$/.test(next))) return next;
  return "/";
}

function qrSource(value: string) {
  if (!value) return "";
  if (value.startsWith("data:image/")) return value;
  if (value.trimStart().startsWith("<svg")) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
  return value;
}

export function RadarAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<RadarMfaChallenge | null>(null);
  const [enrollment, setEnrollment] = useState<RadarMfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInRadar(email, password);
      const next = safeNextPath(location.search);
      if (next.startsWith("/admin")) {
        const mfa = await prepareRadarAdminMfa();
        setChallenge(mfa.challenge);
        setEnrollment(mfa.enrollment);
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
          {enrollment ? (
            <section aria-labelledby="mfa-enrollment-title">
              <h2 id="mfa-enrollment-title">Activa la seguridad administrativa</h2>
              <p>Escanea el código con Google Authenticator, Microsoft Authenticator, 1Password u otra aplicación TOTP. Este paso se realiza una sola vez.</p>
              {enrollment.qrCode ? <img src={qrSource(enrollment.qrCode)} alt="Código QR para activar MFA de RADAR" width="220" height="220" /> : null}
              <p>Si no puedes escanearlo, ingresa esta clave manualmente:</p>
              <code>{enrollment.secret}</code>
            </section>
          ) : (
            <p>Confirma la sesión administrativa con {challenge.friendlyName}.</p>
          )}
          <label>
            Código de seis dígitos
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
