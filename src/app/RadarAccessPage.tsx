import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  completeRadarPasswordSetup,
  requestRadarPasswordRecovery,
  prepareRadarAdminMfa,
  radarAuthCallbackType,
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
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("data:image/svg+xml")) {
    const comma = trimmed.indexOf(",");
    const header = comma >= 0 ? trimmed.slice(0, comma) : "";
    if (header.includes(";base64")) return trimmed;
    const payload = comma >= 0 ? trimmed.slice(comma + 1) : trimmed;
    let svg = payload;
    try {
      svg = decodeURIComponent(payload);
    } catch {
      // Supabase can return either encoded or raw SVG payloads.
    }
    const svgStart = svg.indexOf("<svg");
    if (svgStart >= 0) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.slice(svgStart))}`;
  }
  if (trimmed.startsWith("data:image/")) return trimmed;
  const svgStart = trimmed.indexOf("<svg");
  if (svgStart >= 0) return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(trimmed.slice(svgStart))}`;
  return trimmed;
}

export function RadarAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [callbackType] = useState(() => radarAuthCallbackType());
  const [recovering, setRecovering] = useState(false);
  const [notice, setNotice] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [challenge, setChallenge] = useState<RadarMfaChallenge | null>(null);
  const [enrollment, setEnrollment] = useState<RadarMfaEnrollment | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  function nextPath() {
    return safeNextPath(location.search);
  }

  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(null); setNotice("");
    try {
      await requestRadarPasswordRecovery(email, nextPath());
      setNotice("Si el correo tiene una cuenta habilitada, recibirás un enlace para crear una contraseña nueva. Revisa también la carpeta de correo no deseado.");
    } catch (error) { setError(error instanceof Error ? error.message : "No se pudo solicitar el enlace."); }
    finally { setBusy(false); }
  }

  async function submitPasswordSetup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password !== passwordConfirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    try {
      await completeRadarPasswordSetup(password);
      if (!nextPath().startsWith("/admin")) {
        navigate(nextPath(), { replace: true });
        return;
      }
      const mfa = await prepareRadarAdminMfa();
      setChallenge(mfa.challenge);
      setEnrollment(mfa.enrollment);
      setPassword("");
      setPasswordConfirmation("");
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_PASSWORD_FAILED";
      setError(message === "RADAR_PASSWORD_TOO_SHORT"
        ? "Usa una contraseña de al menos 12 caracteres."
        : "El enlace no pudo validarse. Solicita una invitación nueva si ya expiró.");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInRadar(email, password);
      const next = nextPath();
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
      navigate(nextPath(), { replace: true });
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_MFA_FAILED";
      setError(message === "RADAR_MFA_CODE_REQUIRED" ? "Ingresa el código de seis dígitos." : "El código MFA no pudo verificarse.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-page"><div className="access-shell">
      <section className="access-story"><span className="access-kicker">CENTRO DE MANDO ELECTORAL</span><h1>Decisiones claras.<br/>Territorio bajo control.</h1><p>Ingresa al entorno operativo de RADAR.</p></section>
      <section className="access-panel"><div className="access-panel__header"><div className="access-mark"><img src="/brand/radar-isotipo.svg" alt="RADAR"/></div></div><div className="access-panel__intro"><span className="eyebrow">{nextPath().startsWith('/admin')?'Superadministrador nacional':'Acceso RADAR'}</span><h2>Bienvenido</h2></div>
      {!radarAuthConfigured() ? (
        <p>El runtime autenticado todavía no está configurado en este entorno.</p>
      ) : callbackType && !challenge ? (
        <form onSubmit={submitPasswordSetup} autoComplete="new-password">
          <h2>{callbackType === "invite" ? "Activa tu cuenta RADAR" : "Crea una contraseña nueva"}</h2>
          {callbackType === "invite" && <a href="/guias/primeros-pasos.html" target="_blank" rel="noreferrer">Guía de primeros pasos ↗</a>}
          <p>Define una contraseña exclusiva para RADAR.{nextPath().startsWith("/admin") ? " Después activarás la verificación en dos pasos." : " Después podrás entrar a tu municipio."}</p>
          <label>
            Contraseña nueva
            <input type="password" name="new_password" minLength={12} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus />
          </label>
          <label>
            Confirmar contraseña
            <input type="password" name="password_confirmation" minLength={12} autoComplete="new-password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required />
          </label>
          <small>Mínimo 12 caracteres. No reutilices una contraseña de correo u otro servicio.</small>
          {error ? <p role="alert">{error}</p> : null}
          <button className="button" type="submit" disabled={busy}>{busy ? "Activando…" : "Continuar"}</button>
        </form>
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
      ) : recovering ? (
        <form onSubmit={recover}>
          <h2>Recupera tu acceso</h2>
          <label>Correo de tu cuenta<input type="email" required value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></label>
          {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
          <button className="button" type="submit" disabled={busy}>{busy ? "Solicitando…" : "Enviar enlace"}</button>
          <button type="button" disabled={busy} onClick={() => { setRecovering(false); setError(null); setNotice(""); }}>Volver al ingreso</button>
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
          <button type="button" disabled={busy} onClick={() => { setRecovering(true); setError(null); }}>Olvidé mi contraseña</button>
        </form>
      )}
    </section></div></div>
  );
}
