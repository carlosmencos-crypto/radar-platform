import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

async function text(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("V70 electoral map preserves Golden 0509 microfunctions", async () => {
  const component = await text("src/components/V70ElectoralTerritory.tsx");

  // Golden marker geometry and selected-state sizing.
  assert.ok(component.includes("iconSize:c.active?[62,62]:[54,54]"));
  assert.ok(component.includes("iconAnchor:c.active?[31,55]:[27,47]"));
  assert.ok(component.includes("transform:rotate(-45deg) scale(1.12)"));

  // Golden support-layer symbology: MINEDUC and MSPAS stay visually distinct.
  assert.ok(component.includes("radius:6,color:'#fff',weight:2,fillColor:'#f59e0b',fillOpacity:.98"));
  assert.ok(component.includes("radius:7,color:'#fff',weight:3,fillColor:'#059669',fillOpacity:1"));

  // CEM is a reference circle around associated electoral centers, never a populated-place substitute.
  assert.ok(component.includes("radius:650,color:'#7c3aed',weight:2,dashArray:'5 7',fillColor:'#8b5cf6',fillOpacity:.12"));
  assert.ok(component.includes("referencia territorial, no polígono oficial"));
  assert.equal(component.includes("p.type==='populated_place'&&!layers.territory"), false);

  // Golden keeps the municipal map extent stable when directory selection changes.
  assert.ok(component.includes("map.fitBounds(bounds,{padding:[48,48]})"));
  assert.equal(component.includes("map.setView([selected.lat,selected.lon]"), false);

  // 2026 works remain fail-closed until an authorized same-period geo layer exists.
  assert.ok(component.includes("Obras <b>NO_PUBLICADO</b>"));
});
