import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
const src=stripTypeScriptTypes(readFileSync(new URL('../src/data/municipalNavigation.ts',import.meta.url),'utf8'));
const {withMunicipalScope}=await import(`data:text/javascript;base64,${Buffer.from(src).toString('base64')}`);
test('map destinations retain explicit demo scope across reload and new tab',()=>{
 for(const code of ['0110','0101','0509']) for(const demo of [true,false]) for(const section of ['directorio','agenda']){
  const url=new URL(withMunicipalScope(`/municipio/${code}/${section}?community=${encodeURIComponent('San José & Centro')}&new=1&activity=sample#detalle`,demo),'https://radargt.wowlatam.com');
  assert.equal(url.searchParams.get('demo'),demo?'1':null);
  assert.equal(url.searchParams.get('community'),'San José & Centro');
  assert.equal(url.searchParams.get('activity'),'sample');
  assert.equal(url.pathname,`/municipio/${code}/${section}`);assert.equal(url.hash,'#detalle');
 }
});
test('explicit real scope cannot inherit a demo query and external destinations are rejected',()=>{
 assert.equal(withMunicipalScope('/municipio/0110/directorio?demo=1',false),'/municipio/0110/directorio');
 assert.throws(()=>withMunicipalScope('https://example.org/municipio/0110',true));
});
test('all operational map links use campaign scope, including Leaflet HTML tooltip',()=>{
 const map=readFileSync(new URL('../src/components/V70OperationalMap.tsx',import.meta.url),'utf8');
 assert.equal((map.match(/to=\{scopedHref\(/g)||[]).length,5);
 assert.match(map,/const directoryHref = .*scopedHref/);
 assert.match(map,/withMunicipalScope\(path, consumer.context.is_demo === true\)/);
 assert.doesNotMatch(map,/to=\{`\/municipio/);
});
