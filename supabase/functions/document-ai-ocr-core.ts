/** Server-only Google Document AI adapter. No RTD writes; all output is provisional. */
export type OcrOption = { code: string; label: string };
type Anchor = { textSegments?: Array<{ startIndex?: string | number; endIndex?: string | number }> };
type Layout = { textAnchor?: Anchor; confidence?: number };
export type GoogleDocument = {
  text?: string;
  pages?: Array<{
    lines?: Array<{ layout?: Layout }>;
    imageQualityScores?: { qualityScore?: number; detectedDefects?: Array<{ type?: string; confidence?: number }> };
  }>;
};
export class OcrError extends Error {
  status: number;
  constructor(message: string, status = 503) { super(message); this.status = status; }
}
export type GoogleConfig = { project: string; location: string; processor: string; version: string; email: string; privateKey: string };
const normalize = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
const defectNames: Record<string, string> = {
  blurry: 'fotografía borrosa', noisy: 'ruido en la imagen', dark: 'poca iluminación', faint: 'texto tenue',
  text_too_small: 'texto demasiado pequeño', document_cutoff: 'acta recortada', text_cutoff: 'texto recortado', glare: 'reflejos',
};
export function anchorText(text: string, anchor?: Anchor) {
  // Google offsets are Unicode character indices, not UTF-16 code units.
  const chars = Array.from(text);
  return (anchor?.textSegments ?? []).map(s => chars.slice(Number(s.startIndex ?? 0), Number(s.endIndex ?? 0)).join('')).join('');
}
export function parseGoogleDocument(doc: GoogleDocument, options: OcrOption[]) {
  const text = doc.text ?? '';
  const pages = doc.pages ?? [];
  const lines = pages.flatMap(page => (page.lines ?? []).map(line => ({
    text: anchorText(text, line.layout?.textAnchor).trim(),
    confidence: Math.round(Math.max(0, Math.min(1, line.layout?.confidence ?? 0)) * 100),
  }))).filter(line => line.text);
  const qualityScores = pages.map(p => p.imageQualityScores?.qualityScore).filter((v): v is number => typeof v === 'number');
  const qualityScore = qualityScores.length ? Math.min(...qualityScores) : null;
  const warnings = ['Lectura preliminar: compara cada cifra con el acta original antes de enviar.'];
  for (const page of pages) for (const defect of page.imageQualityScores?.detectedDefects ?? []) {
    if ((defect.confidence ?? 0) > .5) warnings.push(`Revisa la captura: ${defectNames[(defect.type ?? '').replace('quality/defect_', '')] ?? 'calidad insuficiente'}.`);
  }
  const numericSuffix = /^(.*?)\s+(\d{1,4})$/;
  // Only an exact, unique printed option label on the SAME line may suggest a value.
  // No neighbouring-row inference, no fixed 2023 ordering, no arithmetic reconstruction.
  const candidates = options.map(option => {
    const labels = [normalize(option.label), normalize(option.label.split('·')[0])].filter(Boolean);
    const matches = lines.flatMap(line => {
      const m = numericSuffix.exec(line.text);
      if (!m || !labels.includes(normalize(m[1])) || line.confidence < 85 || Number(m[2]) > 5000) return [];
      // Reject labels shared by more than one catalogue option.
      if (options.filter(o => [normalize(o.label), normalize(o.label.split('·')[0])].includes(normalize(m[1]))).length !== 1) return [];
      return [{ code: option.code, label: option.label, value: String(Number(m[2])), confidence: line.confidence, evidence: line.text.slice(0, 240) }];
    });
    return matches.length === 1 ? matches[0] : null;
  }).filter((v): v is NonNullable<typeof v> => v !== null);
  const suggestions = pages.length === 1 && (qualityScore === null || qualityScore >= .5) ? candidates : [];
  if (qualityScore !== null && qualityScore < .5) warnings.push('Vuelve a tomar la fotografía; no se rellenaron cifras por la calidad de la captura.');
  if (suggestions.length < options.length) warnings.push(`${options.length - suggestions.length} filas requieren lectura manual. No se adivinaron cifras.`);
  return {
    provider: 'GOOGLE_DOCUMENT_AI', mode: 'GENERAL', templateLabel: 'Google Document AI · revisión del acta',
    confidence: lines.length ? Math.round(lines.reduce((sum, l) => sum + l.confidence, 0) / lines.length) : 0,
    qualityScore, suggestions, cells: [], controls: [], validVotes: '', nullVotes: '', blankVotes: '',
    votersPresent: '', ballotsReceived: '', ballotsUnused: '', warnings: [...new Set(warnings)], rawText: text,
    requiresHumanReview: true,
  };
}
export function validateImage(bytes: Uint8Array, mime: string) {
  const png = bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((b,i) => bytes[i] === b);
  const jpeg = bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  const webp = bytes.length >= 12 && String.fromCharCode(...bytes.slice(0,4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8,12)) === 'WEBP';
  if (!bytes.length || bytes.length > 12 * 1024 * 1024) throw new OcrError('Usa una fotografía de hasta 12 MB.', 400);
  if (!((mime === 'image/jpeg' && jpeg) || (mime === 'image/png' && png) || (mime === 'image/webp' && webp))) throw new OcrError('Usa una fotografía JPG, PNG o WEBP del acta.', 400);
}
function base64(bytes: Uint8Array) {
  let value = ''; for (let i = 0; i < bytes.length; i += 8192) value += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(value);
}
const b64url = (s: string | Uint8Array) => base64(typeof s === 'string' ? new TextEncoder().encode(s) : s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
export function processorName(c: GoogleConfig) {
  if (!/^[a-z][a-z0-9-]{4,61}[a-z0-9]$|^\d+$/.test(c.project) || !/^(us|eu)$/.test(c.location) || !/^[a-zA-Z0-9_-]+$/.test(c.processor) || !/^[a-zA-Z0-9._-]+$/.test(c.version)) throw new OcrError('La configuración del lector está incompleta.');
  return `projects/${c.project}/locations/${c.location}/processors/${c.processor}/processorVersions/${c.version}`;
}
let cachedToken: { identity: string; token: string; expires: number } | null = null;
async function accessToken(c: GoogleConfig, send: typeof fetch) {
  const identity = c.email + ':' + c.processor;
  if (cachedToken?.identity === identity && cachedToken.expires > Date.now() + 60000) return cachedToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ iss: c.email, scope: 'https://www.googleapis.com/auth/cloud-platform', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }));
  const pem = c.privateKey.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, '');
  const key = await crypto.subtle.importKey('pkcs8', Uint8Array.from(atob(pem), ch => ch.charCodeAt(0)), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await send('https://oauth2.googleapis.com/token', { method: 'POST', signal: AbortSignal.timeout(10000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${header}.${claims}.${b64url(signature)}` }) });
  if (!res.ok) throw new OcrError('No se pudo autenticar el servicio de lectura.');
  const value = await res.json();
  if (typeof value.access_token !== 'string') throw new OcrError('Respuesta de autenticación inválida.');
  cachedToken = { identity, token: value.access_token, expires: Date.now() + Math.min(Number(value.expires_in) || 3600, 3600) * 1000 };
  return cachedToken.token;
}
export async function processGoogleImage(config: GoogleConfig, bytes: Uint8Array, mime: string, send: typeof fetch = fetch): Promise<GoogleDocument> {
  validateImage(bytes, mime);
  const name = processorName(config);
  const token = await accessToken(config, send);
  // No automatic retry: an ambiguous timeout may already have been billed.
  const res = await send(`https://${config.location}-documentai.googleapis.com/v1/${name}:process`, {
    method: 'POST', signal: AbortSignal.timeout(45000), headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ skipHumanReview: true, rawDocument: { content: base64(bytes), mimeType: mime }, processOptions: { individualPageSelector: { pages: [1] }, ocrConfig: { enableImageQualityScores: true, hints: { languageHints: ['es'] } } } }),
  });
  if (!res.ok) throw new OcrError(res.status === 429 ? 'El lector está ocupado. Puedes continuar con captura manual.' : 'No se pudo leer el acta. Puedes continuar con captura manual.', res.status === 429 ? 429 : 503);
  const value = await res.json();
  if (!value.document || value.document.pages?.length !== 1) throw new OcrError('La respuesta no contiene una sola página válida.');
  return value.document;
}
