import { useState } from "react";
import type { MunicipalProfile as MunicipalProfileData } from "../data/municipalProfiles";

const statusLabels = {
  validated: "Validado",
  partial: "Parcial",
  pending: "Pendiente",
};

export function MunicipalProfile({ profile }: { profile: MunicipalProfileData }) {
  const [activeId, setActiveId] = useState(profile.modules[0].id);
  const activeModule = profile.modules.find((module) => module.id === activeId) ?? profile.modules[0];

  return (
    <section className="profile">
      <div className="profile__header">
        <div>
          <span className="eyebrow">Expediente Municipal 360</span>
          <h2>Información validada por módulo</h2>
        </div>
        <div className="control-stamp">
          <span>{profile.controlStatus}</span>
          <small>Corte {profile.lastUpdated}</small>
        </div>
      </div>

      <nav className="module-tabs" aria-label="Módulos del expediente">
        {profile.modules.map((module) => (
          <button
            className={module.id === activeModule.id ? "active" : ""}
            key={module.id}
            onClick={() => setActiveId(module.id)}
            type="button"
          >
            {module.title}
            <i className={`module-dot module-dot--${module.status}`} />
          </button>
        ))}
      </nav>

      <article className="module-panel">
        <div className="module-panel__heading">
          <div>
            <span className={`module-state module-state--${activeModule.status}`}>
              {statusLabels[activeModule.status]}
            </span>
            <h3>{activeModule.title}</h3>
            <p>{activeModule.summary}</p>
          </div>
          <small>Fuente: {activeModule.source}</small>
        </div>
        <div className="module-metrics">
          {activeModule.metrics.map((metric) => (
            <div key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
              <small>{metric.detail}</small>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}
