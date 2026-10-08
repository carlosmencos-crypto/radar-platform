import React from 'react';
import {createRoot} from 'react-dom/client';
import {NationalRtd} from './src/admin/NationalRtd';
import './src/styles/global.css';
import './src/styles/v70/fonts.css';
import './src/styles/superadmin.css';
const snapshot={municipalities:[{municipality_code:'0301',municipality_name:'Municipio de prueba',department_code:'03',department_name:'Departamento de prueba'}]};
createRoot(document.getElementById('root')!).render(<div className="superadmin-shell" style={{padding:'24px',minHeight:'100vh'}}><NationalRtd snapshot={snapshot as any}/></div>);
