import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {MunicipalityProvider} from './src/context/MunicipalityContext';
import {V70LocationPicker} from './src/components/V70LocationPicker';
import './src/styles/global.css';
import './src/styles/v70/fonts.css';
import './src/styles/v70/globals.css';
const consumer={municipality:{code:'0301',name:'Municipio de prueba',departmentCode:'03',department:'Departamento'},context:{campaign_id:'test-only',user_role:'campaign_admin',permissions:[],is_demo:false}};
function Preview(){
 const saved=new URLSearchParams(location.search).has('saved');
 const [result,setResult]=useState('');
 return <MunicipalityProvider consumer={consumer as any}><div className="agenda-modal elector-modal" role="dialog" aria-label="Ficha de contacto de fondo" inert><section className="elector-sheet"><header><h2>Ficha de contacto</h2></header><form className="elector-private-form"><label>Dirección<input defaultValue="Dirección de prueba"/></label></form></section></div><div className="agenda-modal contact-location-modal" role="dialog" aria-label="Mapa de prueba"><V70LocationPicker contactLocation routeMode={false} latitude={saved?14.6:undefined} longitude={saved?-90.6:undefined} points={[]} color="#07576c" onClose={()=>setResult('closed')} onConfirm={p=>setResult(JSON.stringify(p))}/><output data-testid="result">{result}</output></div></MunicipalityProvider>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
