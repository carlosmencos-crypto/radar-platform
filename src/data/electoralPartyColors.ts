// Presentation palette preserved from the approved V70 pilot.
const colors: Record<string, string> = {
  VALOR: "#ef684f", "VALOR UNIONISTA": "#ef684f", UNE: "#2e78bd", VAMOS: "#782f96",
  PPN: "#e4a229", ELEFANTE: "#24a68a", VIVA: "#316e56", SEMILLA: "#6d9f3a", TODOS: "#6b7780",
};
const palette = ["#0072b2", "#d55e00", "#cc79a7", "#009e73", "#e6ab02", "#56b4e9", "#8c564b", "#9467bd", "#e7298a", "#1b9e77", "#7570b3", "#a6761d", "#17becf", "#bcbd22", "#b2182b", "#2166ac", "#4d9221", "#c51b7d", "#762a83", "#dfc27d", "#80cdc1", "#f4a582", "#92c5de", "#b8a5cf"];
const keyFor = (party: string) => party.trim().toLocaleUpperCase("es-GT");
export function electoralPartyColor(party: string): string {
  const key = party.trim().toLocaleUpperCase("es-GT");
  const hash = Array.from(key).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  return colors[key] ?? palette[hash % palette.length];
}

// One palette per complete result universe, independent of rank or selection.
// Reserve pilot colors first, then maximize separation without reusing a swatch.
// Labels, ranks and exact values remain visible: color is never the only key.
export function buildElectoralPartyPalette(parties: string[]): Record<string, string> {
  const keys = [...new Set(parties.map(keyFor).filter(Boolean))].sort();
  const output: Record<string, string> = {};
  const used = new Set<string>();
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const distance = (a: string, b: string) => rgb(a).reduce((sum, value, i) => sum + (value - rgb(b)[i]) ** 2, 0);
  for (const key of keys) if (colors[key]) { output[key] = colors[key]; used.add(colors[key]); }
  for (const key of keys) {
    if (output[key]) continue;
    const available = palette.filter((color) => !used.has(color));
    const color = available.sort((a, b) => {
      const separation = (candidate: string) => Math.min(...[...used].map((other) => distance(candidate, other)), 200000);
      return separation(b) - separation(a);
    })[0] ?? `hsl(${(keys.indexOf(key) * 137.508) % 360} 65% 45%)`;
    output[key] = color;
    used.add(color);
  }
  return Object.fromEntries(parties.map((party) => [party, output[keyFor(party)] ?? "#6b7780"]));
}
