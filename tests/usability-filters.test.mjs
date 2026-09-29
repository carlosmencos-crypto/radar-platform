import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesAgendaFilters } from '../src/data/agendaFilters.ts';
import { actaPath } from '../src/data/actaArchive.ts';
const activity = {status:'COMPLETADA',starts_at:'2020-01-01',details:{responsible_person_id:'a',participant_ids:['b']}};
test('agenda matches responsible OR participant and completed past activities',()=>{
 assert.equal(matchesAgendaFilters(activity,'a','COMPLETADA'),true);
 assert.equal(matchesAgendaFilters(activity,'b','COMPLETADA'),true);
 assert.equal(matchesAgendaFilters(activity,'b','CANCELADA'),false);
 assert.equal(matchesAgendaFilters(activity,'unassigned-alcalde',''),false);
 assert.equal(matchesAgendaFilters(activity,'',''),true);
});
test('acta archive preserves hierarchy and unique names without traversal',()=>{
 const file={id:'unique-id',municipality_code:'0203',municipality_name:'San Agustín',center_name:'../Centro/Uno',jrv_number:9,election_type:'PRESIDENTE',file_name:'../../foto.png'};
 const path=actaPath(file);
 assert.equal(path.split('/').length,5);
 assert.equal(path.split('/')[2],'JRV 9');
 assert.equal(path.includes('/../'),false);
 assert.notEqual(path,actaPath({...file,id:'another-id'}));
});
