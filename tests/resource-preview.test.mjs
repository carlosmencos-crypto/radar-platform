import test from 'node:test';
import assert from 'node:assert/strict';
import { validateResource, resourceAccept } from '../src/data/resourceFormats.ts';
import { parseCsv } from '../src/data/documentPreview.ts';
test('Office, PDF and text uploads accept extensions without browser MIME',()=>{
 for(const ext of ['doc','docx','xls','xlsx','ppt','pptx','pdf','csv','txt']) {
  assert.doesNotThrow(()=>validateResource({name:`document.${ext.toUpperCase()}`,size:100}));
  assert.ok(resourceAccept.includes(`.${ext}`));
 }
 assert.throws(()=>validateResource({name:'unsafe.html',size:100}));
 assert.throws(()=>validateResource({name:'empty.pdf',size:0}));
 assert.throws(()=>validateResource({name:'large.pdf',size:25*1024*1024+1}));
});
test('CSV preserves quoted commas, line breaks and escaped quotes',()=>{
 assert.deepEqual(parseCsv('Nombre,Texto\r\n"Uno, Dos","Línea 1\nLínea ""2"""\r\n'),[['Nombre','Texto'],['Uno, Dos','Línea 1\nLínea "2"']]);
 assert.deepEqual(parseCsv('Nombre;Cantidad\nGuía;3'),[['Nombre','Cantidad'],['Guía','3']]);
});
