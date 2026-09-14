export function V70Ecosystem0509() {
  const items = [
    ["01", "Expediente 360", "Fotografía municipal, electoral y territorial", "ACTIVO", "public"],
    ["02", "Biblioteca ejecutiva", "Documentos y fichas descargables", "SIGUIENTE", "public"],
    ["03", "Agenda y acuerdos", "Giras, reuniones, compromisos y avances", "CAMPAIGN VAULT", "private"],
    ["04", "Operación territorial", "Comunidades, responsables y cobertura de campo", "CAMPAIGN VAULT", "private"],
    ["05", "Encuestas y cualitativo", "Carga, segmentación y aprendizaje", "CAMPAIGN VAULT", "private"],
    ["✦", "Agente IA municipal", "Asistente entrenado con el expediente y permisos", "NÚCLEO PREMIUM", "ai"],
  ] as const;

  return <>
    <section id="ecosistema" className="section ecosystem">
      <div className="section-head"><div><p className="eyebrow">PORTAL RADAR · VISIÓN DE PRODUCTO</p><h2>De la evidencia a la operación diaria</h2></div><p>El Expediente 360 informa la estrategia. Los demás módulos convierten esa estrategia en agenda, seguimiento, aprendizaje y acción de campaña.</p></div>
      <div className="ecosystem-grid">
        {items.map(([number, title, copy, status, kind]) => <article key={title} className={kind}><span>{number}</span><div><b>{title}</b><p>{copy}</p><small>{status}</small></div></article>)}
      </div>
      <div className="vault-rule"><div><b>RADAR Data Vault</b><span>Fuentes públicas, oficiales y productos validados.</span></div><i>≠</i><div><b>Campaign Vault</b><span>Agenda, acuerdos, encuestas y operación privada del candidato.</span></div></div>
    </section>
  </>;
}
