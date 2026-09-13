import { useEffect, useMemo, useRef } from "react";
import type { GeoBoundingBox } from "../data/radarRuntime";

export interface V70VotingCenterPoint {
  center_correlative: number;
  center_name: string;
  community: string | null;
  latitude: number | null;
  longitude: number | null;
}

function safeJson(value: unknown) {
  return JSON.stringify(value).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026");
}

function documentFor(
  municipalityName: string,
  centers: V70VotingCenterPoint[],
  selectedCenter: number | null,
  bbox: GeoBoundingBox,
) {
  const points = centers.filter((center) => center.latitude !== null && center.longitude !== null);
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.css"/>
<style>
html,body,#map{height:100%;width:100%;margin:0;background:#f7f5ef;font-family:Inter,Arial,sans-serif}.maplibregl-ctrl-attrib{font-size:8px!important}.maplibregl-ctrl-top-right{top:54px}
.radar-center-marker{width:54px;height:54px;background:transparent;border:0;padding:0;cursor:pointer;overflow:visible}.radar-marker{width:50px;min-height:44px;display:flex;flex-direction:column;align-items:center;justify-content:center;border-radius:12px 12px 12px 2px;background:#08576e;color:white;border:3px solid white;box-shadow:0 5px 14px rgba(45,51,58,.31);transform:rotate(-45deg);transition:.18s ease}.radar-marker b,.radar-marker small{transform:rotate(45deg);display:block;line-height:1}.radar-marker b{font-size:10px}.radar-marker small{font-size:7.5px;max-width:39px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:5px}.radar-center-marker.active .radar-marker{box-shadow:0 0 0 4px #2d333a,0 7px 19px rgba(45,51,58,.4);transform:rotate(-45deg) scale(1.12)}
.maplibregl-popup-content{border-radius:10px;padding:10px 12px;box-shadow:0 12px 30px rgba(45,51,58,.18);color:#2f343a}.maplibregl-popup-content b{display:block;font-size:11px}.maplibregl-popup-content small{font-size:9px;color:#66706d}
</style></head><body><div id="map" aria-label="Mapa electoral de ${municipalityName.replace(/[<>&"]/g, "")}"></div>
<script src="https://unpkg.com/maplibre-gl@5/dist/maplibre-gl.js"></script><script>(function(){
const points=${safeJson(points)};const selected=${safeJson(selectedCenter)};const bbox=${safeJson(bbox)};
const map=new maplibregl.Map({container:'map',style:'https://tiles.openfreemap.org/styles/liberty',attributionControl:true,cooperativeGestures:false});
map.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
map.on('load',function(){map.fitBounds([[bbox.west,bbox.south],[bbox.east,bbox.north]],{padding:48,maxZoom:15,duration:0});points.forEach(function(center){
 const el=document.createElement('button');el.type='button';el.className='radar-center-marker'+(center.center_correlative===selected?' active':'');el.setAttribute('aria-label','Centro '+center.center_correlative+' '+center.center_name);
 el.innerHTML='<span class="radar-marker"><b>'+String(center.center_correlative).padStart(3,'0')+'</b><small>TSE</small></span>';
 el.addEventListener('click',function(){window.parent.postMessage({type:'radar-v70-center-select',center:center.center_correlative},'*');});
 const marker=new maplibregl.Marker({element:el,anchor:'bottom'}).setLngLat([center.longitude,center.latitude]).addTo(map);
 const clean=function(v){return String(v||'').replace(/[<>]/g,'');};
 marker.setPopup(new maplibregl.Popup({offset:28}).setHTML('<b>'+clean(center.center_name)+'</b><small>'+clean(center.community||'Centro electoral')+'</small>'));
 if(center.center_correlative===selected){setTimeout(function(){map.flyTo({center:[center.longitude,center.latitude],zoom:14,duration:0});},60);}
});});})();</script></body></html>`;
}

export function V70ElectoralMap({ municipalityName, centers, selectedCenter, bbox, onSelect }: {
  municipalityName: string;
  centers: V70VotingCenterPoint[];
  selectedCenter: number | null;
  bbox: GeoBoundingBox;
  onSelect: (centerCorrelative: number) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const html = useMemo(() => documentFor(municipalityName, centers, selectedCenter, bbox), [municipalityName, centers, selectedCenter, bbox]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const payload = event.data as { type?: string; center?: unknown } | null;
      if (payload?.type !== "radar-v70-center-select") return;
      const center = Number(payload.center);
      if (Number.isInteger(center) && center > 0) onSelect(center);
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [onSelect]);

  return <iframe ref={frame} className="real-map" title={`Mapa electoral de ${municipalityName}`} srcDoc={html} sandbox="allow-scripts allow-popups" referrerPolicy="strict-origin-when-cross-origin" />;
}
