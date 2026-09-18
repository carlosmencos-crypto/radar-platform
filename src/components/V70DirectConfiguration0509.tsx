import { useState, type ChangeEvent } from "react";
import { Link, useParams } from "react-router-dom";
import {
  MunicipalityProvider,
  useMunicipalityContext,
} from "../context/MunicipalityContext";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { V70DirectShell0509 } from "./V70DirectShell0509";
import { useV70CampaignBrand } from "./useV70CampaignBrand";

function ConfigurationContent() {
  const { municipality_code, municipality_name, department_name } = useMunicipalityContext();
  const { candidateName, candidatePhotoUrl, partyName } = useV70CampaignBrand();
  const [photo, setPhoto] = useState(() => {
    window.localStorage.removeItem("radar-user-photo");
    return window.localStorage.getItem("radar-user-photo-v2") || "";
  });
  const [saved, setSaved] = useState("");
  function changePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 2_000_000) {
      setSaved("La fotografía debe pesar menos de 2 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result || "");
      window.localStorage.setItem("radar-user-photo-v2", value);
      setPhoto(value);
      window.dispatchEvent(new Event("radar-profile-updated"));
      setSaved("Fotografía de usuario actualizada en este dispositivo.");
    };
    reader.readAsDataURL(file);
  }
  return (
    <>
      <section className="section-banner">
        <div className="section-banner-copy">
          <p>CONTROL DEL PORTAL</p>
          <h1>Configuración</h1>
          <span>
            Identidad, acceso, privacidad, alertas y preferencias de la campaña
          </span>
        </div>
      </section>
      <main className="configuration-center simplified">
        <section className="config-overview">
          <article>
            <small>CAMPAÑA</small>
            <div className="config-campaign-identity">
              {candidatePhotoUrl ? <img src={candidatePhotoUrl} alt="Fotografía del candidato" /> : null}
              <div>
                <b>{candidateName}</b>
                <span>{partyName || "Organización política pendiente"}</span>
              </div>
            </div>
            <Link to={`/municipio/${municipality_code}/directorio?view=team`}>
              Administrar identidad desde el CRM →
            </Link>
          </article>
          <article>
            <small>MUNICIPIO</small>
            <b>Municipio {municipality_code}</b>
            <span>{municipality_name} · {department_name}</span>
            <em>El alcance está protegido por la sesión.</em>
          </article>
          <article>
            <small>VAULT</small>
            <b>Privado por campaña</b>
            <span>Auditoría y archivos protegidos</span>
            <em>Las consultas sensibles quedan trazadas.</em>
          </article>
        </section>
        <section className="config-essential-grid">
          <article>
            <header>
              <small>PERFIL</small>
              <h2>Fotografía de usuario</h2>
            </header>
            <div className="config-user-photo">
              {photo ? (
                <img src={photo} alt="Fotografía del usuario" />
              ) : (
                <i>R</i>
              )}
              <label>
                <span>Cambiar fotografía</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={changePhoto}
                />
              </label>
            </div>
            <p>
              Se utiliza en el acceso personal y ayuda a distinguir cuentas.
            </p>
          </article>
          <article>
            <header>
              <small>ACCESO RÁPIDO</small>
              <h2>Datos maestros</h2>
            </header>
            <nav>
              <Link to={`/municipio/${municipality_code}/directorio?view=team`}>
                Equipo y responsables
              </Link>
              <Link to={`/municipio/${municipality_code}/recursos#fisicos`}>
                Banco de recursos
              </Link>
              <Link to={`/municipio/${municipality_code}/dia-d#centros`}>
                Centros, fiscales y JRV
              </Link>
            </nav>
            <p>
              La identidad de campaña se actualiza desde las tarjetas CRM y los
              archivos oficiales.
            </p>
          </article>
          <article>
            <header>
              <small>SEGURIDAD</small>
              <h2>Sesión</h2>
            </header>
            <p>
              Usa una cuenta individual. El municipio, la campaña y los permisos
              se validan en cada operación.
            </p>
            <button
              type="button"
              onClick={() =>
                window.location.assign(
                  "/signout-with-chatgpt?return_to=%2Flogin",
                )
              }
            >
              Cerrar sesión
            </button>
          </article>
        </section>
        {saved ? <p className="agenda-message">{saved}</p> : null}
      </main>
    </>
  );
}

export function V70DirectConfiguration0509() {
  const { municipalityCode } = useParams();
  const consumer = resolveRadarConsumer(municipalityCode);
  if (!consumer) return null;
  const municipalityTitle = `${consumer.municipality.displayName ?? consumer.municipality.name} · ${consumer.municipality.department}`;
  return (
    <MunicipalityProvider consumer={consumer}>
      <V70DirectShell0509
        active="configuracion"
        eyebrow="CUENTA"
        topbarTitle={municipalityTitle}
      >
        <ConfigurationContent />
      </V70DirectShell0509>
    </MunicipalityProvider>
  );
}
