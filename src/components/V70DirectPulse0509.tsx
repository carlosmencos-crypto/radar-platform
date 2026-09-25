import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MunicipalityProvider, useMunicipalityContext } from "../context/MunicipalityContext";
import { ensureRadarAccessToken } from "../data/radarAuth";
import type { PulseElectionType } from "../data/pulseScope";
import { resolveRadarConsumer } from "../data/radarConsumer";
import { loadAuthorizedPulse } from "../data/radarRuntime";
import { V70DirectShell0509 } from "./V70DirectShell0509";

type Election = PulseElectionType;
type Result = { optionCode: string; candidateName: string; organization: string; value: number };
type Survey = { folio: string; electionType: Election; fieldEnd: string; sampleSize: number; scopeLabel: string; methodology: string; sourceLabel: string; results: Result[] };

const colors = ["#09566C", "#5A2973", "#C47A5A", "#65736B", "#A7ACA5", "#2E343B"];
const electionTypes: Array<[Election, string]> = [["ALCALDIA", "Alcaldía municipal"], ["PRESIDENTE", "Presidencia"], ["DIP_NAC", "Diputación por Lista Nacional"], ["DIP_DIST", "Diputación distrital"], ["PARLACEN", "Parlacen"]];
const catalogs: Record<Election, Array<[string, string]>> = {
  ALCALDIA: [["Planilla VALOR", "VALOR"], ["Planilla VAMOS", "VAMOS"], ["Planilla UNE", "UNE"], ["Planilla PPN", "PPN"], ["No sabe / no responde", ""]],
  PRESIDENTE: [["Sandra Torres", "UNE"], ["Zury Ríos", "VALOR-UNIONISTA"], ["Manuel Conde", "VAMOS"], ["Bernardo Arévalo", "SEMILLA"], ["No sabe / no responde", ""]],
  DIP_NAC: [["Lista UNE", "UNE"], ["Lista VAMOS", "VAMOS"], ["Lista VALOR-UNIONISTA", "VALOR-UNIONISTA"], ["Lista VIVA", "VIVA"], ["No sabe / no responde", ""]],
  DIP_DIST: [["Lista VALOR", "VALOR"], ["Lista UNE", "UNE"], ["Lista VAMOS", "VAMOS"], ["Lista ELEFANTE", "ELEFANTE"], ["No sabe / no responde", ""]],
  PARLACEN: [["Lista UNE", "UNE"], ["Lista VAMOS", "VAMOS"], ["Lista VALOR-UNIONISTA", "VALOR-UNIONISTA"], ["Lista VIVA", "VIVA"], ["No sabe / no responde", ""]],
};
const series: Record<Election, number[][]> = { ALCALDIA: [[30,23,20,9,18],[31,24,21,8,16],[32,25,21,8,14]], PRESIDENTE: [[31,15,12,10,32],[32,15,12,12,29],[33,14,11,15,27]], DIP_NAC: [[22,17,15,10,36],[23,18,15,10,34],[24,18,16,10,32]], DIP_DIST: [[24,20,15,9,32],[25,20,16,9,30],[26,21,16,9,28]], PARLACEN: [[20,18,15,9,38],[21,19,16,9,35],[22,20,16,10,32]] };
const waves = ["2023-04-15", "2023-05-15", "2023-06-15"];
const demo: Survey[] = (Object.keys(catalogs) as Election[]).flatMap((electionType) => waves.map((fieldEnd, waveIndex) => ({ folio: `DEMO-${electionType}-${waveIndex + 1}`, electionType, fieldEnd, sampleSize: 400, scopeLabel: "Alcance autorizado", methodology: "Valores simulados exclusivamente para validar la experiencia de Pulso Electoral.", sourceLabel: "RADAR · SIMULACIÓN", results: catalogs[electionType].map(([candidateName, organization], index) => ({ optionCode: `${electionType}-${index + 1}`, candidateName, organization, value: series[electionType][waveIndex][index] })) })));

function dateLabel(value: string) { return new Intl.DateTimeFormat("es-GT", { month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`)); }
function electionLabel(value: Election) { return electionTypes.find(([key]) => key === value)?.[1] ?? value; }

function TrendChart({ surveys }: { surveys: Survey[] }) {
  const ordered = [...surveys].sort((a,b)=>a.fieldEnd.localeCompare(b.fieldEnd));
  const latest = ordered.at(-1); if (!latest || ordered.length < 2) return <p className="pulse-empty">La tendencia aparecerá cuando existan al menos dos mediciones comparables.</p>;
  const options = latest.results.filter((item)=>!/no sabe|no responde/i.test(item.candidateName)).slice(0,4);
  const width=720, height=250, left=45, right=18, top=20, bottom=38;
  const maxValue=Math.max(20,Math.ceil(Math.max(...ordered.flatMap((survey)=>survey.results.map((item)=>item.value)))/10)*10);
  const x=(index:number)=>left+(ordered.length===1?0:index/(ordered.length-1)*(width-left-right)); const y=(value:number)=>top+(1-value/maxValue)*(height-top-bottom);
  return <div className="pulse-trend-wrap"><svg className="pulse-trend-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Evolución de intención de voto por medición">{[0,.25,.5,.75,1].map((share)=><g key={share}><line x1={left} x2={width-right} y1={y(maxValue*share)} y2={y(maxValue*share)} /><text x={left-8} y={y(maxValue*share)+4} textAnchor="end">{Math.round(maxValue*share)}%</text></g>)}{options.map((option,optionIndex)=>{const points=ordered.map((survey,waveIndex)=>{const value=survey.results.find((item)=>item.optionCode===option.optionCode)?.value??0; return {x:x(waveIndex),y:y(value),value};}); return <g key={option.optionCode} className="pulse-trend-series"><polyline points={points.map((point)=>`${point.x},${point.y}`).join(" ")} style={{stroke:colors[optionIndex]}} />{points.map((point,index)=><g key={index}><circle cx={point.x} cy={point.y} r="5" style={{fill:colors[optionIndex]}} />{index===points.length-1?<text className="pulse-point-value" x={point.x-4} y={point.y-10} textAnchor="end" style={{fill:colors[optionIndex]}}>{point.value.toFixed(1)}%</text>:null}</g>)}</g>;})}{ordered.map((survey,index)=><text className="pulse-axis-date" key={survey.folio} x={x(index)} y={height-10} textAnchor="middle">{dateLabel(survey.fieldEnd)}</text>)}</svg><div className="pulse-trend-legend">{options.map((option,index)=><span key={option.optionCode}><i style={{background:colors[index]}} /><b>{option.candidateName}</b></span>)}</div></div>;
}

function PulseContent() {
  const { municipality_code, municipality_name, department_name, is_demo } = useMunicipalityContext();
  const [election,setElection]=useState<Election>("ALCALDIA");
  const [mode,setMode]=useState<"demo"|"radar">("demo");
  const [radarSurveys,setRadarSurveys]=useState<Survey[]>([]);
  const [radarStatus,setRadarStatus]=useState("Las mediciones reales se cargan solo al abrir esta vista.");
  useEffect(()=>{
    let cancelled=false;
    if(mode!=="radar")return;
    if(is_demo){setRadarSurveys([]);setRadarStatus("El espacio demo no consulta mediciones privadas de campañas reales.");return;}
    setRadarStatus("Cargando mediciones autorizadas…");
    void ensureRadarAccessToken().then((token)=>loadAuthorizedPulse(municipality_code,token)).then((measurements)=>{
      if(cancelled)return;
      setRadarSurveys(measurements.map((measurement)=>({folio:measurement.folio,electionType:measurement.election_type,fieldEnd:measurement.field_end,sampleSize:measurement.sample_size,scopeLabel:measurement.scope_label,methodology:measurement.methodology,sourceLabel:measurement.source_label,results:measurement.results.map((result)=>({optionCode:result.option_code,candidateName:result.candidate_name,organization:result.organization??"",value:Number(result.value)}))})));
      setRadarStatus(measurements.length?"Mediciones publicadas dentro del alcance autorizado.":"Aún no hay encuestas RADAR publicadas para este alcance.");
    }).catch(()=>{if(!cancelled){setRadarSurveys([]);setRadarStatus("Pulso está preparado; falta activar su almacenamiento seguro en Supabase.");}});
    return()=>{cancelled=true;};
  },[mode,municipality_code,is_demo]);
  const scopedDemo=useMemo(()=>demo.map((survey)=>({...survey,scopeLabel:survey.electionType==="ALCALDIA"?municipality_name:survey.electionType==="DIP_DIST"?department_name:"Guatemala"})),[municipality_name,department_name]);
  const source=mode==="demo"?scopedDemo:radarSurveys;
  const selected=useMemo(()=>source.filter((survey)=>survey.electionType===election).sort((a,b)=>b.fieldEnd.localeCompare(a.fieldEnd)),[election,source]);
  const latest=selected[0];
  const previous=selected[1];
  const ranked=latest?[...latest.results].sort((a,b)=>b.value-a.value):[];
  const leader=ranked[0];
  const previousLeaderValue=leader?previous?.results.find((item)=>item.optionCode===leader.optionCode)?.value:undefined;
  const change=!leader||previousLeaderValue===undefined?null:leader.value-previousLeaderValue;
  return <><section className="section-banner"><div className="section-banner-copy"><p>MEDICIÓN Y TENDENCIAS</p><h1>Pulso Electoral</h1><span>Encuestas comparables, metodología visible y tendencias sin inventar certeza</span></div></section><main className="pulse-dashboard"><section className={`pulse-disclaimer ${mode}`}><span><b>{mode==="demo"?"SIMULACIÓN VISUAL":"ENCUESTAS RADAR"}</b><small>{mode==="demo"?"Candidaturas y organizaciones 2023 con porcentajes simulados. No es una encuesta ni un resultado electoral.":"Solo aparecen mediciones publicadas autorizadas para este municipio, su departamento o el alcance nacional."}</small></span><nav><button className={mode==="demo"?"active":""} onClick={()=>setMode("demo")}>Demostración 2023</button><button className={mode==="radar"?"active":""} onClick={()=>setMode("radar")}>Encuestas RADAR</button></nav></section><section className="pulse-election-tabs" aria-label="Tipo de elección">{electionTypes.map(([value,label])=><button key={value} className={election===value?"active":""} onClick={()=>setElection(value)}>{label}</button>)}</section>{!latest?<section className="pulse-empty"><b>{radarStatus}</b><span>La simulación permanece separada para no mezclar datos demostrativos con mediciones reales.</span></section>:<><section className="pulse-overview"><article><small>ÚLTIMA MEDICIÓN</small><b>{dateLabel(latest.fieldEnd)}</b><span>{latest.scopeLabel}</span></article><article><small>MUESTRA</small><b>{latest.sampleSize.toLocaleString("es-GT")}</b></article><article><small>PRIMERA POSICIÓN</small><b>{leader?`${leader.value.toFixed(1)}%`:"—"}</b><span>{leader?.candidateName??"Sin resultados publicados"}</span></article><article><small>CAMBIO ÚLTIMA OLA</small><b>{change===null?"—":`${change>=0?"+":""}${change.toFixed(1)} pts`}</b><span>Comparación homogénea</span></article></section><section className="pulse-main-grid single"><article className="pulse-ranking"><header><div><small>INTENCIÓN DE VOTO · {latest.scopeLabel.toUpperCase()}</small><h2>{electionLabel(election)}</h2></div><strong>{dateLabel(latest.fieldEnd)}</strong></header><div>{ranked.map((result,index)=><article key={result.optionCode}><span><i style={{background:colors[index%colors.length]}} /><b>{result.candidateName}</b><small>{result.organization||"Sin organización"}</small></span><strong>{result.value.toFixed(1)}%</strong><div><i style={{width:`${result.value}%`,background:colors[index%colors.length]}} /></div></article>)}</div><footer>{latest.methodology}</footer></article></section><section className="pulse-trend"><header><small>EVOLUCIÓN COMPARABLE</small><h2>Intención de voto a lo largo del tiempo</h2></header><TrendChart surveys={selected} /></section><section className="pulse-history"><header><div><small>BITÁCORA DE MEDICIONES</small><h2>Encuestas del período</h2></div><span>{selected.length} registros</span></header><div>{selected.map((survey)=><article key={survey.folio}><span><small>{survey.folio}</small><b>{dateLabel(survey.fieldEnd)}</b></span><span><small>Alcance</small><b>{survey.scopeLabel}</b></span><span><small>Muestra</small><b>{survey.sampleSize.toLocaleString("es-GT")}</b></span><span><small>Fuente</small><b>{survey.sourceLabel}</b></span><em>{mode==="demo"?"DEMOSTRACIÓN":"PUBLICADA"}</em></article>)}</div></section></>}</main></>;
}

export function V70DirectPulse0509(){const {municipalityCode}=useParams(); const consumer=resolveRadarConsumer(municipalityCode); if(!consumer)return null; const municipalityTitle=`${consumer.municipality.displayName??consumer.municipality.name} · ${consumer.municipality.department}`; return <MunicipalityProvider consumer={consumer}><V70DirectShell0509 active="pulso" eyebrow="INVESTIGACIÓN" topbarTitle={municipalityTitle} accountRole="Dirección de campaña"><PulseContent/></V70DirectShell0509></MunicipalityProvider>;}
