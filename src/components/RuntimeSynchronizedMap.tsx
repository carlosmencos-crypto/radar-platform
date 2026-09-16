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

  const baseStyle = satellite
    ? {
        version: 8,
        sources: {
          imagery: {
            type: "raster",
            tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
            tileSize: 256,
            attribution: "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
          },
        },
        layers: [{ id: "imagery", type: "raster", source: "imagery" }],
      }
    : "https://tiles.openfreemap.org/styles/liberty";

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css" />
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#F7F5EF;font-family:Arial,sans-serif}
.maplibregl-ctrl-attrib{font-size:9px!important}
.maplibregl-popup-content{border-radius:10px;box-shadow:0 10px 30px rgba(47,52,58,.18);padding:10px 12px;color:#2F343A}
.maplibregl-popup-content b{display:block;font-size:12px;margin-bottom:2px}.maplibregl-popup-content span{font-size:10px;color:#66706d}
</style>
</head>
<body>
<div id="map" aria-label="Mapa territorial de ${municipalityName.replace(/[<>&"]/g, "")}"></div>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script>
<script>
(function(){
  const points=${escapeScriptJson(points)};
  const bbox=${escapeScriptJson(bbox)};
  const style=${escapeScriptJson(baseStyle)};
  const geojson={type:'FeatureCollection',features:points.map(function(point){return {type:'Feature',geometry:{type:'Point',coordinates:[point.lng,point.lat]},properties:{name:point.name,label:point.label,color:point.color,radius:point.radius,type:point.type}};})};
  const map=new maplibregl.Map({container:'map',style:style,attributionControl:true,cooperativeGestures:false});
  map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
  map.on('load',function(){
    const bounds=[[bbox.west,bbox.south],[bbox.east,bbox.north]];
    map.fitBounds(bounds,{padding:28,maxZoom:15,duration:0});
    map.addSource('radar-points',{type:'geojson',data:geojson});
    map.addLayer({id:'radar-points',type:'circle',source:'radar-points',paint:{
      'circle-radius':['coalesce',['get','radius'],5],
      'circle-color':['coalesce',['get','color'],'#08576E'],
      'circle-opacity':0.92,
      'circle-stroke-width':1.5,
      'circle-stroke-color':'#ffffff'
    }});
    map.on('mouseenter','radar-points',function(){map.getCanvas().style.cursor='pointer';});
    map.on('mouseleave','radar-points',function(){map.getCanvas().style.cursor='';});
    map.on('click','radar-points',function(event){
      const feature=event.features&&event.features[0];
      if(!feature)return;
      const coordinates=feature.geometry.coordinates.slice();
      const properties=feature.properties||{};
      const clean=function(value){return String(value||'').replace(/[<>]/g,'');};
      new maplibregl.Popup({closeButton:true,closeOnClick:true})
        .setLngLat(coordinates)
        .setHTML('<b>'+clean(properties.name)+'</b><span>'+clean(properties.label)+'</span>')
        .addTo(map);
    });
    setTimeout(function(){map.resize();},80);
  });
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
    referrerPolicy="strict-origin-when-cross-origin"
  />;
}
