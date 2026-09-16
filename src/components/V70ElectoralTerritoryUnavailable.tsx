import type { MunicipalityGeoBundle } from "../data/radarRuntime";

const elections = ["Presidencia", "Lista nacional", "Distrito", "Alcaldía", "Parlacen"] as const;

export function V70ElectoralTerritoryUnavailable({
  municipalityName,
  geoBundle,
  state = "NO_PUBLICADO",
}: {
  municipalityName: string;
  geoBundle?: MunicipalityGeoBundle;
  state?: "NO_PUBLICADO" | "PARCIAL" | "SIN_REGISTRO";
}) {
  const schools = geoBundle?.feature_counts.school ?? 0;
  const health = geoBundle?.feature_counts.health_facility ?? 0;
  return <>
    <section id="mapa" className="map-section exportable include-print" data-electoral-state={state}>
      <div className="section-head map-heading"><div><p className="eyebrow">INTELIGENCIA ELECTORAL TERRITORIAL</p><h2>El voto centro por centro</h2></div><p>No mostramos únicamente al ganador: cambia la elección, compara participación, margen, cobertura de actas y las cinco fuerzas principales de cada centro.</p></div>
      <div className="election-switch" role="tablist" aria-label="Tipo de elección">
        {elections.map((label, index) => <button key={label} className={index === 3 ? "active" : ""} disabled><span>{label}</span><small>{state}</small></button>)}
      </div>
      <div className="map-workspace">
        <aside className="directory">
          <div className="directory-head"><div><p className="eyebrow">DIRECTORIO ELECTORAL</p><h3>{state}</h3></div><span>0</span></div>
          <label className="search"><span>⌕</span><input value="" readOnly placeholder="Buscar centro o comunidad" aria-label="Buscar centro o comunidad" /></label>
          <div className="center-list"><div className="canonical-vault-notice"><span>{state}</span><h3>Resultados por centro aún no publicados</h3><p>La estructura V70 se conserva hasta que el Data Vault autorice esta capa para {municipalityName}.</p></div></div>
          <div className="directory-note"><b>Scroll independiente</b><span>El directorio se habilita sin cambiar su estructura cuando exista asociación oficial centro/JRV.</span></div>
        </aside>
        <div className="map-panel">
          <div className="intelligence-map-toolbar" aria-label="Controles del mapa de Inteligencia Municipal">
            <div className="metric-switch"><button className="active" disabled>Ganador</button><button disabled>Participación</button><button disabled>Margen</button><button disabled>Actas</button></div>
            <div className="layer-switch">
              <button className="layer-electoral on" disabled><i className="electoral-dot" />Electoral <b>{state}</b></button>
              <button className="layer-schools on" disabled><i className="school-dot" />Escuelas <b>{schools || "SIN_REGISTRO"}</b></button>
              <button className="layer-territory" disabled><i className="territory-dot" />CEM</button>
              <button className="layer-health on" disabled><i className="health-dot" />Salud <b>{health || "SIN_REGISTRO"}</b></button>
              <button className="layer-works on" disabled><i className="works-dot" />Obras <b>NO_PUBLICADO</b></button>
            </div>
          </div>
          <div className="active-reading"><span>Visualizando</span><b>Alcaldía · Partido ganador</b><small>{state}</small></div>
          <div className="real-map canonical-map-pending" aria-label={`Mapa interactivo de centros de votación de ${municipalityName}`}><span>{state}</span><h2>Inteligencia electoral territorial en preparación</h2><p>RADAR no inventa centros, resultados ni asociaciones geográficas faltantes.</p></div>
          <div className="map-source"><span>Mapa base y estructura V70 preservados</span><span>TREP 2023 · {state}</span></div>
          <article className="center-card include-print" aria-live="polite"><div className="center-card-head"><span>CV —</span><div><b>{state}</b><small>{municipalityName}</small></div></div><div className="center-stats"><div><small>Empadronados</small><b>—</b></div><div><small>JRV</small><b>—</b></div><div><small>Actas computadas</small><b>—/—</b></div><div><small>Participación</small><b>—</b></div></div><div className="result-heading"><span>Resultado · Alcaldía</span><b>{state}</b></div><div className="mini-ranking" /><div className="vote-quality"><span>Votos por opción <b>—</b></span><span>Blancos <b>—</b></span><span>Nulos <b>—</b></span></div></article>
        </div>
      </div>
    </section>
    <section className="section electoral-depth exportable include-print">
      <div className="section-head"><div><p className="eyebrow">LECTURA ELECTORAL MUNICIPAL</p><h2>Corporación Municipal</h2></div><p>Ranking municipal completo de las diez fuerzas principales y lectura de calidad del corte. Los porcentajes se calculan sobre votos por opción.</p></div>
      <div className="election-summary"><div className="election-kpis"><article><small>Liderazgo municipal</small><b>{state}</b><span>—</span></article><article><small>Segunda fuerza</small><b>—</b><span>—</span></article><article><small>Margen</small><b>—</b><span>—</span></article><article><small>Actas computadas</small><b>—/—</b><span>{state}</span></article><article><small>Participación</small><b>—</b><span>—</span></article></div><div className="full-ranking"><div className="canonical-vault-notice"><span>{state}</span><h3>Ranking no publicado</h3><p>Se mostrará aquí sin alterar el componente V70 cuando exista fuente oficial autorizada.</p></div></div></div>
      <p className="preliminary-note">Estado semántico canónico: {state}. La ausencia de datos no se sustituye con estimaciones ni resúmenes genéricos.</p>
    </section>
  </>;
}
