import type { CampaignActivityRecord } from "../data/radarRuntime";
import type { V70RoutePoint } from "./V70LocationPicker";

type ActivityLike = Pick<
  CampaignActivityRecord,
  "id" | "title" | "activity_type" | "starts_at" | "community" | "latitude" | "longitude" | "status" | "notes" | "details"
>;

export type ActivityPngBrand = {
  campaignName?: string;
  partyName?: string;
  partyLogoUrl?: string;
  municipality?: string;
};

function routePoints(activity: ActivityLike): V70RoutePoint[] {
  const value = activity.details?.route_points;
  if (!Array.isArray(value)) return [];
  return value.filter(
    (point): point is V70RoutePoint =>
      Array.isArray(point) &&
      point.length === 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
}

function routeColor(activity: ActivityLike) {
  const value = activity.details?.route_color;
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
    ? value
    : "#09566c";
}

export function V70RouteSnapshot({
  activity,
}: {
  activity: ActivityLike;
  compact?: boolean;
}) {
  const points = routePoints(activity);
  if (activity.activity_type !== "CAMINATA" || points.length < 2) return null;
  const xs = points.map(([, x]) => x); const ys = points.map(([y]) => y);
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
  const line = points.map(([y, x]) => `${20 + ((x - minX) / (maxX - minX || 1)) * 360},${180 - ((y - minY) / (maxY - minY || 1)) * 140}`).join(" ");
  const first = line.split(" ")[0].split(","); const last = line.split(" ").at(-1)?.split(",") ?? first;
  return (
    <div className="route-snapshot"><svg viewBox="0 0 400 200" role="img" aria-label="Vista congelada de la ruta"><defs><pattern id="radar-route-grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M20 0H0V20" fill="none" stroke="var(--radar-marfil)" strokeWidth="1" /></pattern></defs><rect width="400" height="200" fill="var(--radar-marfil)" /><rect width="400" height="200" fill="url(#radar-route-grid)" /><polyline points={line} fill="none" stroke={routeColor(activity)} strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" /><circle cx={first[0]} cy={first[1]} r="7" fill="var(--radar-grafito)" /><circle cx={last[0]} cy={last[1]} r="7" fill={routeColor(activity)} /></svg><span>IMAGEN DE RUTA · {points.length} PUNTOS · CONGELADA AL GUARDAR</span></div>
  );
}

function safeFileName(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLocaleLowerCase("es") || "actividad";
}

function roundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2); context.beginPath(); context.moveTo(x + r, y); context.arcTo(x + width, y, x + width, y + height, r); context.arcTo(x + width, y + height, x, y + height, r); context.arcTo(x, y + height, x, y, r); context.arcTo(x, y, x + width, y, r); context.closePath();
}
function fillRoundedRect(context: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number, color: string) { context.fillStyle = color; roundedRect(context, x, y, width, height, radius); context.fill(); }
function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3) {
  const words = text.trim().split(/\s+/).filter(Boolean); const lines: string[] = []; let current = "";
  for (const word of words) { const candidate = current ? `${current} ${word}` : word; if (!current || context.measureText(candidate).width <= maxWidth) current = candidate; else { lines.push(current); current = word; if (lines.length === maxLines - 1) break; } }
  if (current && lines.length < maxLines) lines.push(current); return lines;
}
function fitSingleLine(context: CanvasRenderingContext2D, text: string, maxWidth: number) { if (context.measureText(text).width <= maxWidth) return text; let value = text; while (value.length && context.measureText(`${value}…`).width > maxWidth) value = value.slice(0, -1); return `${value.trim()}…`; }
function loadImage(src: string) { return new Promise<HTMLImageElement>((resolve, reject) => { const image = new Image(); image.crossOrigin = "anonymous"; image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
function tileCoordinates(latitude: number, longitude: number, zoom: number) { const scale = 2 ** zoom; const x = ((longitude + 180) / 360) * scale; const latRad = latitude * Math.PI / 180; const y = (1 - Math.asinh(Math.tan(latRad)) / Math.PI) / 2 * scale; return { x, y }; }
async function drawMap(context: CanvasRenderingContext2D, activity: ActivityLike, x: number, y: number, width: number, height: number) {
  const points = routePoints(activity); const valid = points.length > 1 ? points : activity.latitude !== null && activity.longitude !== null ? [[Number(activity.latitude), Number(activity.longitude)] as V70RoutePoint] : [];
  context.save(); roundedRect(context, x, y, width, height, 24); context.clip(); context.fillStyle = "#E5E1D8"; context.fillRect(x, y, width, height);
  let loaded = false; let zoom = 16; let centerLat = valid[0]?.[0] ?? 13.93; let centerLon = valid[0]?.[1] ?? -90.82;
  if (valid.length > 1) { const lats = valid.map(([lat]) => lat); const lons = valid.map(([, lon]) => lon); centerLat = (Math.min(...lats) + Math.max(...lats)) / 2; centerLon = (Math.min(...lons) + Math.max(...lons)) / 2; while (zoom > 12) { const projected = valid.map(([lat, lon]) => tileCoordinates(lat, lon, zoom)); const spanX = (Math.max(...projected.map((item) => item.x)) - Math.min(...projected.map((item) => item.x))) * 256; const spanY = (Math.max(...projected.map((item) => item.y)) - Math.min(...projected.map((item) => item.y))) * 256; if (spanX <= width - 150 && spanY <= height - 110) break; zoom -= 1; } }
  if (valid.length) {
    const center = tileCoordinates(centerLat, centerLon, zoom); const tileX = Math.floor(center.x); const tileY = Math.floor(center.y); const pixelX = (center.x - tileX) * 256; const pixelY = (center.y - tileY) * 256; const tiles: Array<{ image: HTMLImageElement; dx: number; dy: number }> = [];
    for (let oy = -1; oy <= 1; oy += 1) for (let ox = -2; ox <= 2; ox += 1) { try { const image = await loadImage(`https://tile.openstreetmap.org/${zoom}/${tileX + ox}/${tileY + oy}.png`); tiles.push({ image, dx: x + width / 2 - pixelX + ox * 256, dy: y + height / 2 - pixelY + oy * 256 }); } catch { /* se conserva el fondo de referencia */ } }
    if (tiles.length >= 4) { tiles.forEach((tile) => context.drawImage(tile.image, tile.dx, tile.dy, 256, 256)); loaded = true; }
    if (valid.length > 1) { const drawLine = (stroke: string, lineWidth: number) => { context.strokeStyle = stroke; context.lineWidth = lineWidth; context.lineJoin = "round"; context.lineCap = "round"; context.beginPath(); valid.forEach(([lat, lon], index) => { const point = tileCoordinates(lat, lon, zoom); const px = x + width / 2 + (point.x - center.x) * 256; const py = y + height / 2 + (point.y - center.y) * 256; if (index) context.lineTo(px, py); else context.moveTo(px, py); }); context.stroke(); }; drawLine("rgba(255,255,255,.92)", 14); drawLine(routeColor(activity), 8); }
    const start = tileCoordinates(valid[0][0], valid[0][1], zoom); const mx = x + width / 2 + (start.x - center.x) * 256; const tip = y + height / 2 + (start.y - center.y) * 256; context.fillStyle = "#B85F43"; context.beginPath(); context.arc(mx, tip - 42, 24, 0, Math.PI * 2); context.fill(); context.beginPath(); context.moveTo(mx - 15, tip - 26); context.lineTo(mx, tip); context.lineTo(mx + 15, tip - 26); context.fill(); context.fillStyle = "#fff"; context.beginPath(); context.arc(mx, tip - 42, 8, 0, Math.PI * 2); context.fill();
  }
  if (!loaded) { context.strokeStyle = "#C4CEC9"; context.lineWidth = 9; for (let index = -height; index < width + height; index += 95) { context.beginPath(); context.moveTo(x + index, y); context.lineTo(x + index + height, y + height); context.stroke(); } }
  context.restore(); context.fillStyle = "rgba(255,255,255,.92)"; context.fillRect(x + width - 205, y + height - 29, 195, 20); context.fillStyle = "#5F6A68"; context.font = "500 13px Arial"; context.textAlign = "right"; context.fillText(loaded ? "Mapa © OpenStreetMap" : "Referencia de ubicación", x + width - 17, y + height - 15); context.textAlign = "left";
}
function activityDetailText(activity: ActivityLike, key: string) { const value = activity.details?.[key]; return typeof value === "string" ? value : ""; }
function activityNames(activity: ActivityLike, key: string) { const value = activity.details?.[key]; if (!Array.isArray(value)) return []; return value.map((item) => typeof item === "string" ? item : item && typeof item === "object" && "full_name" in item ? String((item as { full_name?: unknown }).full_name || "") : item && typeof item === "object" && "fullName" in item ? String((item as { fullName?: unknown }).fullName || "") : "").filter(Boolean); }
function drawParticipantGroup(context: CanvasRenderingContext2D, title: string, names: string[], x: number, y: number, width: number) { context.fillStyle = "#59706B"; context.font = "800 15px Arial"; context.fillText(title, x, y); context.fillStyle = "#1C272D"; context.font = "600 16px Arial"; if (!names.length) { context.fillStyle = "#7A8581"; context.fillText("Sin registros", x, y + 44); return; } let cursor = y + 42; names.slice(0, 8).forEach((name) => { wrapLines(context, name, width - 18, 2).forEach((line, index) => context.fillText(`${index ? "   " : "•  "}${line}`, x, cursor + index * 20)); cursor += 48; }); }

export async function downloadActivityPng(activity: ActivityLike, brand: ActivityPngBrand = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No fue posible preparar la imagen de la actividad.");
  context.fillStyle = "#F8F6F0"; context.fillRect(0, 0, 1080, 1350); context.fillStyle = "#1C272D"; context.fillRect(0, 0, 1080, 348); context.fillStyle = "#D69070"; context.fillRect(0, 0, 16, 348);
  context.fillStyle = "#D69070"; context.font = "800 21px Arial"; context.fillText("AGENDA TERRITORIAL · RADAR", 70, 67); context.fillStyle = "#FFFFFF"; context.font = "800 54px Arial"; wrapLines(context, activity.title, 760, 3).forEach((line, index) => context.fillText(line, 70, 135 + index * 61));
  context.fillStyle = "#C9D2CE"; context.font = "600 22px Arial"; context.fillText(`${brand.municipality || "San José / Puerto San José · Escuintla"} · ${brand.campaignName || "Campaña municipal"}`, 70, 308);
  if (brand.partyLogoUrl) { try { const logo = await loadImage(brand.partyLogoUrl); fillRoundedRect(context, 872, 52, 142, 142, 71, "#FFFFFF"); context.save(); context.beginPath(); context.arc(943, 123, 59, 0, Math.PI * 2); context.clip(); const ratio = Math.min(96 / logo.width, 96 / logo.height); context.drawImage(logo, 943 - logo.width * ratio / 2, 123 - logo.height * ratio / 2, logo.width * ratio, logo.height * ratio); context.restore(); } catch { /* el PNG conserva identidad textual */ } }
  context.fillStyle = "#FFFFFF"; context.font = "700 17px Arial"; context.textAlign = "center"; wrapLines(context, brand.partyName || "PARTIDO POLÍTICO", 160, 2).forEach((line, index) => context.fillText(line, 943, 225 + index * 21)); context.textAlign = "left";
  await drawMap(context, activity, 55, 382, 970, 350); fillRoundedRect(context, 78, 654, 710, 56, 14, "rgba(28,39,45,.88)"); context.fillStyle = "#FFFFFF"; context.font = "700 20px Arial"; context.fillText(`⌖  ${activity.community || "Ubicación por confirmar"}`, 100, 690, 655);
  const date = activity.starts_at ? new Date(activity.starts_at) : null; const dateLabel = date ? `${new Intl.DateTimeFormat("es-GT", { day: "2-digit", month: "short" }).format(date).replace(".", "").toUpperCase()} · ${new Intl.DateTimeFormat("es-GT", { hour: "numeric", minute: "2-digit" }).format(date)}` : "FECHA PENDIENTE";
  const cards = [["FECHA Y HORA", dateLabel], ["RESPONSABLE", activityDetailText(activity, "responsible") || "Por asignar"], ["ESTADO", activity.status.replace(/_/g, " ")]];
  cards.forEach(([label, value], index) => { const x = 55 + index * 326; fillRoundedRect(context, x, 752, 308, 78, 18, "#FFFFFF"); context.fillStyle = "#59706B"; context.font = "800 15px Arial"; context.fillText(label, x + 22, 779); context.fillStyle = "#1C272D"; context.font = "700 21px Arial"; context.fillText(fitSingleLine(context, value, 264), x + 22, 810); });
  fillRoundedRect(context, 55, 842, 970, 56, 16, "#FFFFFF"); context.fillStyle = "#59706B"; context.font = "800 15px Arial"; context.fillText("TEMAS / OBJETIVO / NOTAS:", 77, 877); context.fillStyle = "#1C272D"; context.font = "600 17px Arial"; context.fillText(fitSingleLine(context, activity.notes?.trim() || "Sin temas u observaciones registrados", 675), 328, 877);
  const manual = activityDetailText(activity, "manual_participants").split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean); fillRoundedRect(context, 55, 910, 970, 315, 18, "#FFFFFF"); context.strokeStyle = "#E5E1D8"; context.lineWidth = 2; context.beginPath(); context.moveTo(377, 942); context.lineTo(377, 1192); context.stroke(); context.beginPath(); context.moveTo(700, 942); context.lineTo(700, 1192); context.stroke(); drawParticipantGroup(context, "PARTICIPANTES DEL EQUIPO:", activityNames(activity, "participants"), 80, 950, 272); drawParticipantGroup(context, "ELECTORES PARTICIPANTES:", activityNames(activity, "electors"), 402, 950, 272); drawParticipantGroup(context, "SECTORES PARTICIPANTES:", manual, 725, 950, 272);
  context.strokeStyle = "#D8D5CC"; context.lineWidth = 2; context.beginPath(); context.moveTo(55, 1271); context.lineTo(1025, 1271); context.stroke(); context.fillStyle = "#1C272D"; context.font = "800 21px Arial"; context.fillText("RADAR", 55, 1312); context.fillStyle = "#59706B"; context.font = "600 16px Arial"; context.fillText("Información operativa de campaña", 158, 1311); context.textAlign = "right"; context.fillText("Confirma tu asistencia con el responsable", 1025, 1311); context.textAlign = "left";
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo generar el PNG.")), "image/png"));
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `radar-actividad-${safeFileName(activity.title) || activity.id}.png`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
