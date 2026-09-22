// Presentation palette preserved from the approved V70 pilot.
const colors: Record<string, string> = {
  VALOR: "#ef684f", "VALOR UNIONISTA": "#ef684f", UNE: "#2e78bd", VAMOS: "#782f96",
  PPN: "#e4a229", ELEFANTE: "#24a68a", VIVA: "#316e56", SEMILLA: "#6d9f3a", TODOS: "#6b7780",
};
const palette = ["#08576e", "#974d39", "#552676", "#4c7261", "#ad7626", "#526a96"];
export function electoralPartyColor(party: string): string {
  const key = party.trim().toLocaleUpperCase("es-GT");
  const hash = Array.from(key).reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 0);
  return colors[key] ?? palette[hash % palette.length];
}
