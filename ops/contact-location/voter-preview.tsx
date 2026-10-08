import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {VoterRecordSheetView} from './src/components/VoterRecordSheet';
import V70DocumentPhotoEditor from './src/components/V70DocumentPhotoEditor';
import {rectifyDocument} from './src/data/documentPhoto';
import './src/styles/global.css';import './src/styles/v70/fonts.css';import './src/styles/v70/globals.css';
(window as any).__rectifyDocument=rectifyDocument;
const image='data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200"><rect width="320" height="200" fill="#dfebe4"/><text x="25" y="100" fill="#09566c">DOCUMENTO DE PRUEBA</text></svg>');
function Preview(){
 const query=new URLSearchParams(location.search),full=query.has('full');
 const [open,setOpen]=useState(true),[value,setValue]=useState(''),[error,setError]=useState('');
 if(query.has('editor'))return <main><V70DocumentPhotoEditor label="Frente" value={value} onChange={setValue} onError={setError}/><output data-testid="saved" style={{display:"none"}}>{value}</output><p role="alert">{error}</p></main>;
 const detail={elector:{id:1,full_name:'PERSONA FICTICIA DE PRUEBA',community:'Comunidad de prueba',estimated_age_2026:35,municipality_code:'0509',municipality_name:'San José',masked_identification:'*********0001'},profile:full?{phone_primary:'0000 0000',photo_url:image,latitude:'14.2',longitude:'-90.8',dpi_front_url:image,dpi_back_url:image,notes:'Datos ficticios para revisión visual.',assigned_person_name:'Responsable de prueba'}:{},interactions:[]};
 return <><p data-testid="background">Editor privado detrás de la ficha</p>{open?<VoterRecordSheetView detail={detail} dpi="" onReveal={()=>{}} onClose={()=>setOpen(false)} municipalityName="San José" departmentName="Escuintla" campaignName="Campaña de prueba" partyName="Partido de prueba" isDemo={query.has('demo')}/>:<button onClick={()=>setOpen(true)}>Abrir ficha</button>}</>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
