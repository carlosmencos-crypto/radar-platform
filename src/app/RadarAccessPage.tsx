import { useState, type FormEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { radarAuthConfigured, signInRadar } from "../data/radarAuth";

function safeNextPath(search: string) {
  const next = new URLSearchParams(search).get("next");
  if (next && /^\/municipio\/\d{4}(?:\/[a-z0-9-]+)?(?:\?.*)?$/.test(next)) return next;
  return "/";
}

export function RadarAccessPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signInRadar(email, password);
      navigate(safeNextPath(location.search), { replace: true });
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_AUTH_FAILED";
      setError(message === "RADAR_AUTH_400" ? "Credenciales inválidas." : "No fue posible validar la sesión.");
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
