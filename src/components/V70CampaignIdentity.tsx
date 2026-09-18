import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import {
  saveCampaignIdentity,
} from "../data/radarRuntime";
import {
  announceV70CampaignUpdate,
  useV70CampaignBrand,
} from "./useV70CampaignBrand";

function fileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener(
      "load",
      () => resolve(String(reader.result ?? "")),
      { once: true },
    );
    reader.addEventListener(
      "error",
      () => reject(new Error("No se pudo leer el logotipo.")),
      { once: true },
    );
    reader.readAsDataURL(file);
  });
}

export function V70CampaignIdentity() {
  const { campaign_id, municipality_name } = useMunicipalityContext();
  const {
    identity,
    candidateName,
    candidatePhotoUrl,
    load,
  } = useV70CampaignBrand();
  const [open, setOpen] = useState(false);
  const [partyName, setPartyName] = useState("");
  const [partyLogo, setPartyLogo] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const logoPreview = useMemo(
    () => (partyLogo ? URL.createObjectURL(partyLogo) : ""),
    [partyLogo],
  );

  useEffect(
    () => () => {
      if (logoPreview) URL.revokeObjectURL(logoPreview);
    },
    [logoPreview],
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    const normalizedName = partyName.trim();
    if (!partyLogo && !normalizedName) {
      setMessage("Cambia al menos un dato.");
      return;
    }
    if (partyLogo && partyLogo.size > 1_000_000) {
      setMessage("El logotipo debe pesar menos de 1 MB.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const logo = partyLogo
        ? await fileAsDataUrl(partyLogo)
        : identity.party_logo_data_url;
      const token = await ensureRadarAccessToken();
      const saved = await saveCampaignIdentity(
        campaign_id,
        {
          candidate_name:
            candidateName || "Nombre Apellido",
          party_name: normalizedName || identity.party_name,
          party_logo_data_url: logo || null,
        },
        token,
      );
      void saved;
      setPartyName("");
      setPartyLogo(null);
      setOpen(false);
      setSavedMessage("Identidad actualizada correctamente.");
      announceV70CampaignUpdate();
      await load();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "No se pudo actualizar la identidad.",
      );
    } finally {
      setSaving(false);
    }
  }

  const logo = logoPreview || identity.party_logo_data_url || "";
  return (
    <>
      <aside
        className="campaign-identity"
        aria-label="Identidad del proyecto político"
      >
        <div className="candidate-photo-wrap">
          {candidatePhotoUrl ? (
            <img src={candidatePhotoUrl} alt={`Fotografía de ${candidateName}`} />
          ) : (
            <i aria-label={`Perfil de ${candidateName}`}>NA</i>
          )}
          <span>PERFIL DE CAMPAÑA</span>
        </div>
        <div className="candidate-copy">
          <small>CANDIDATO A LA ALCALDÍA</small>
          <b>{candidateName}</b>
          <span>Candidato a alcalde · {municipality_name}</span>
          <button
            className="party-signature party-signature-trigger"
            type="button"
            onClick={() => {
              setMessage("");
              setSavedMessage("");
              setOpen(true);
            }}
            aria-label="Cambiar nombre y logotipo del partido"
            title="Cambiar nombre y logotipo del partido"
          >
            <span className="party-logo-button" aria-hidden="true">
              {identity.party_logo_data_url ? (
                <img src={identity.party_logo_data_url} alt="" />
              ) : (
                <i>LOGO</i>
              )}
            </span>
            <span>
              <small>ORGANIZACIÓN POLÍTICA</small>
              <strong>{identity.party_name}</strong>
            </span>
          </button>
          {savedMessage ? (
            <small className="campaign-identity-saved" role="status">
              {savedMessage}
            </small>
          ) : null}
        </div>
      </aside>
      {open && typeof document !== "undefined" ? createPortal((
        <div
          className="agenda-modal campaign-identity-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="campaign-party-modal-title"
        >
          <form
            className="simple-campaign-modal campaign-identity-modal"
            onSubmit={save}
          >
            <header>
              <div>
                <small>INICIO</small>
                <h2 id="campaign-party-modal-title">Partido político</h2>
              </div>
              <button
                data-modal-close
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Cerrar"
              >
                ×
              </button>
            </header>
            <label>
              <span>Nombre del partido</span>
              <input
                autoFocus
                value={partyName}
                onChange={(event) => setPartyName(event.target.value)}
                placeholder={identity.party_name || "Nombre del partido"}
              />
            </label>
            <label>
              <span>Logotipo del partido</span>
              <span className="campaign-identity-preview">
                {logo ? (
                  <img src={logo} alt="Vista previa del logotipo" />
                ) : (
                  <i>LOGO</i>
                )}
                <b>{partyLogo?.name || "Seleccionar logotipo"}</b>
              </span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) =>
                  setPartyLogo(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <p>
              La fotografía y los datos de cada candidato se administran
              únicamente desde su tarjeta CRM.
            </p>
            {message ? <p className="form-error">{message}</p> : null}
            <footer>
              <button type="button" onClick={() => setOpen(false)}>
                Cancelar
              </button>
              <button disabled={saving}>
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
            </footer>
          </form>
        </div>
      ), document.body) : null}
    </>
  );
}
