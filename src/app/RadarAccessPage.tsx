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
  const nextPath = safeNextPath(location.search);
  const isDemoAccess = new URLSearchParams(location.search).get("next")?.includes("demo=1") ?? false;
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
      navigate(nextPath, { replace: true });
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : "RADAR_AUTH_FAILED";
      setError(message === "RADAR_AUTH_400" ? "Credenciales inválidas." : "No fue posible validar la sesión.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access-page">
      <div className="access-shell">
        <section className="access-story" aria-labelledby="access-heading">
          <div>
            <span className="access-kicker">Centro de mando electoral</span>
            <h1 id="access-heading">Decisiones claras.<br />Territorio bajo control.</h1>
            <p>Ingresa al entorno operativo de RADAR para coordinar estrategia, equipo y ejecución municipal desde un solo lugar.</p>
          </div>

        </section>

        <section className="access-panel" aria-label="Inicio de sesión">
          <div className="access-panel__header">
            <div className="access-mark" aria-hidden="true">
              <img src="/brand/radar-electoral-isotipo.svg" alt="" />
            </div>
            {isDemoAccess ? <span className="access-environment">Entorno demo</span> : null}
          </div>

          <div className="access-panel__intro">
            <span className="eyebrow">Acceso RADAR</span>
            <h2>Bienvenido de nuevo</h2>
            <p>Utiliza tus credenciales para continuar al municipio asignado.</p>
          </div>

          {!radarAuthConfigured() ? (
            <div className="access-message access-message--warning" role="status">
              El acceso autenticado todavía no está configurado en este entorno.
            </div>
          ) : (
            <form className="access-form" onSubmit={submit} autoComplete="on">
              <label className="access-field">
                <span>Correo electrónico</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  inputMode="email"
                  placeholder="nombre@correo.com"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>

              <label className="access-field">
                <span>Contraseña</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  placeholder="Ingresa tu contraseña"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>

              {error ? <p className="access-message access-message--error" role="alert">{error}</p> : null}

              <button className="button access-submit" type="submit" disabled={busy}>
                <span>{busy ? "Validando acceso…" : "Ingresar a RADAR"}</span>
                <span aria-hidden="true">→</span>
              </button>
            </form>
          )}

        </section>
      </div>
    </div>
  );
}
