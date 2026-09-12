import { useMemo } from "react";
import type { GeoBoundingBox, GeoFeatureRecord } from "../data/radarRuntime";

const MAP_PRESENTATION: Record<string, { label: string; color: string; radius: number }> = {
  populated_place: { label: "Lugar poblado", color: "#08576E", radius: 5 },
  tse_voting_center: { label: "Centro de votación", color: "#552676", radius: 7 },
  school: { label: "Educación", color: "#2F343A", radius: 5 },
  health_facility: { label: "Salud", color: "#A7ACA5", radius: 6 },
};

function escapeScriptJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function buildDocument(
  municipalityName: string,
  features: GeoFeatureRecord[],
  bbox: GeoBoundingBox,
  satellite: boolean,
) {
  const points = features
    .filter((feature) => feature.latitude !== null && feature.longitude !== null)
    .map((feature) => ({
      lat: feature.latitude,
      lng: feature.longitude,
      name: feature.feature_name ?? MAP_PRESENTATION[feature.feature_type]?.label ?? "Punto RADAR",
      type: feature.feature_type,
      label: MAP_PRESENTATION[feature.feature_type]?.label ?? feature.feature_type,
      color: MAP_PRESENTATION[feature.feature_type]?.color ?? "#08576E",
      radius: MAP_PRESENTATION[feature.feature_type]?.radius ?? 5,
    }));

  const tileUrl = satellite
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
    : "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  const attribution = satellite
    ? "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community"
    : "© OpenStreetMap contributors";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="anonymous" />
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#F7F5EF;font-family:Arial,sans-serif}
.leaflet-control-attribution{font-size:9px!important}
.leaflet-popup-content-wrapper{border-radius:10px;box-shadow:0 10px 30px rgba(47,52,58,.18)}
.leaflet-popup-content{margin:10px 12px;line-height:1.35;color:#2F343A}
.leaflet-popup-content b{display:block;font-size:12px;margin-bottom:2px}.leaflet-popup-content span{font-size:10px;color:#66706d}
</style>
</head>
<body>
<div id="map" aria-label="Mapa territorial de ${municipalityName.replace(/[<>&"]/g, "")}"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin="anonymous"></script>
<script>
(function(){
  const points=${escapeScriptJson(points)};
  const bbox=${escapeScriptJson(bbox)};
  const map=L.map('map',{zoomControl:true,attributionControl:true,preferCanvas:true});
  L.tileLayer(${escapeScriptJson(tileUrl)},{maxZoom:20,attribution:${escapeScriptJson(attribution)}}).addTo(map);
  const bounds=L.latLngBounds([bbox.south,bbox.west],[bbox.north,bbox.east]);
  if(bounds.isValid()) map.fitBounds(bounds,{padding:[24,24],maxZoom:15}); else map.setView([15.5,-90.2],8);
  points.forEach(function(point){
    const marker=L.circleMarker([point.lat,point.lng],{radius:point.radius,color:'#ffffff',weight:1.5,fillColor:point.color,fillOpacity:.92});
    marker.bindPopup('<b>'+String(point.name).replace(/[<>]/g,'')+'</b><span>'+String(point.label).replace(/[<>]/g,'')+'</span>');
    marker.addTo(map);
  });
  setTimeout(function(){map.invalidateSize(false);},80);
})();
</script>
</body>
</html>`;
}

export function RuntimeSynchronizedMap({
  municipalityName,
  features,
  activeTypes,
  query,
  bbox,
  satellite,
}: {
  municipalityName: string;
  features: GeoFeatureRecord[];
  activeTypes: Set<string>;
  query: string;
  bbox: GeoBoundingBox;
  satellite: boolean;
}) {
  const normalizedQuery = query.trim().toLocaleLowerCase("es");
  const visible = useMemo(() => features.filter((feature) => {
    if (!activeTypes.has(feature.feature_type) || feature.latitude === null || feature.longitude === null) return false;
    if (!normalizedQuery) return true;
    const haystack = `${feature.feature_name ?? ""} ${Object.values(feature.properties ?? {}).join(" ")}`.toLocaleLowerCase("es");
    return haystack.includes(normalizedQuery);
  }), [features, activeTypes, normalizedQuery]);

  const documentHtml = useMemo(
    () => buildDocument(municipalityName, visible, bbox, satellite),
    [municipalityName, visible, bbox, satellite],
  );

  return <iframe
    className="smart-map-canvas"
    title={`Mapa territorial de ${municipalityName}`}
    loading="lazy"
    srcDoc={documentHtml}
    sandbox="allow-scripts allow-popups"
    referrerPolicy="no-referrer"
  />;
}
