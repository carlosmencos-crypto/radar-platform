const layers = [
  { label: "Lugares poblados", count: "82", state: "81 georreferenciados" },
  { label: "Centros de votación", count: "13", state: "confirmados" },
  { label: "Educación", count: "76", state: "registros" },
  { label: "Salud", count: "5", state: "establecimientos" },
];

export function TerritorialMap0509() {
  const bbox = "-90.98%2C13.82%2C-90.68%2C14.04";
  const marker = "13.9256%2C-90.8244";
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${marker}`;
  const externalUrl = "https://www.openstreetmap.org/?mlat=13.9256&mlon=-90.8244#map=12/13.9256/-90.8244";

  return (
    <section className="territorial-map">
      <div className="territorial-map__heading">
        <div>
          <span className="eyebrow">Mapa territorial</span>
          <h2>San José / Puerto San José</h2>
          <p>Base cartográfica real centrada en el municipio. Las capas RADAR se publican únicamente con geometrías y coordenadas validadas.</p>
        </div>
        <a href={externalUrl} target="_blank" rel="noreferrer">Abrir mapa completo ↗</a>
      </div>

      <div className="map-layout">
        <div className="map-frame">
          <iframe
            title="Mapa territorial de San José, Escuintla"
            src={mapUrl}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
          <div className="map-attribution">© OpenStreetMap contributors</div>
        </div>
        <aside className="layer-panel">
          <div className="layer-panel__title">
            <span>Capas disponibles</span>
            <small>Inventario validado</small>
          </div>
          {layers.map((layer) => (
            <div className="layer-row" key={layer.label}>
              <span><i />{layer.label}</span>
              <strong>{layer.count}</strong>
              <small>{layer.state}</small>
            </div>
          ))}
          <div className="map-warning">
            <strong>Publicación progresiva</strong>
            <p>El inventario está conectado; la visualización puntual se activará por capa después del control de coordenadas.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
