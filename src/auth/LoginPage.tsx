import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "./AuthContext";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/municipios";
  return value;
}

export function LoginPage() {
  const { configured, loading, session, signIn } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const returnTo = safeReturnTo(searchParams.get("returnTo"));

  useEffect(() => {
    if (!loading && session) navigate(returnTo, { replace: true });
  }, [loading, navigate, returnTo, session]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      await signIn(email.trim(), password);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No fue posible iniciar sesión.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="login-page">
    <section className="login-card" aria-labelledby="login-title">
      <Link className="login-brand" to="/" aria-label="RADAR inicio">
        <img src="/brand/radar-electoral-logo-horizontal-oscuro-transparente.svg" alt="RADAR Inteligencia Electoral" />
      </Link>
      <div className="login-copy">
        <span>ACCESO PRIVADO</span>
        <h1 id="login-title">Ingresá a RADAR</h1>
        <p>La inteligencia municipal y la operación de campaña requieren una sesión autorizada.</p>
      </div>
      <form onSubmit={submit}>
        <label><span>Correo electrónico</span><input type="email" autoComplete="username" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label><span>Contraseña</span><input type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error ? <p className="login-error" role="alert">{error}</p> : null}
        {!configured ? <p className="login-error" role="alert">La conexión segura no está configurada en este entorno.</p> : null}
        <button type="submit" disabled={!configured || submitting}>{submitting ? "Verificando…" : "Ingresar"}</button>
      </form>
      <small>El acceso se valida en Supabase y cada consulta aplica RLS por municipio, campaña y rol.</small>
    </section>
  </main>;
}

