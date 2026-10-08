/** Adapter for the existing FiscalOcrResult review UI. Never submits RTD votes. */
export async function readGoogleFiscalAct(
  file: File,
  electionType: string,
  context: { supabaseUrl: string; publishableKey: string; fiscalSession: string },
  onProgress: (progress: number, status: string) => void,
) {
  if (!navigator.onLine) throw new Error('Sin conexión. Usa la lectura local o captura manual.');
  const origin = new URL(context.supabaseUrl);
  if (origin.protocol !== 'https:' || origin.hostname !== 'xxobbhnhxhcjkdxmjmwj.supabase.co') throw new Error('Servicio de lectura no configurado.');
  const form = new FormData(); form.append('file', file); form.append('electionType', electionType);
  onProgress(15, 'Leyendo el acta con Google Document AI…');
  const response = await fetch(`${origin.origin}/functions/v1/fiscal-document-ocr`, {
    method: 'POST', signal: AbortSignal.timeout(65000),
    headers: { apikey: context.publishableKey, 'x-radar-session': context.fiscalSession }, body: form,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'No se pudo leer el acta. Puedes continuar manualmente.');
  if (result.provider !== 'GOOGLE_DOCUMENT_AI' || result.electionType !== electionType || result.requiresHumanReview !== true) throw new Error('Respuesta de lectura inválida.');
  onProgress(100, 'Lectura lista para revisión');
  return result;
}
