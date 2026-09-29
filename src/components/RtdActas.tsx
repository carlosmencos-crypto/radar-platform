import { actaPath } from "../data/actaArchive";
import { useEffect, useRef, useState } from "react";
import { ensureRadarAccessToken } from "../data/radarAuth";
import { downloadRtdEvidence, loadRtdEvidence, type RtdEvidence } from "../data/radarRuntime";

function save(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob); const link = document.createElement("a");
  link.href = url; link.download = name; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 60000);
}
export default function RtdActas({ campaignId }: { campaignId: string }) {
  const [files, setFiles] = useState<RtdEvidence[]>([]);
  const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0); const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true); const [page, setPage] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false; setLoading(true); setFiles([]); setPage(0);
    void ensureRadarAccessToken().then(token => loadRtdEvidence(campaignId, token)).then(rows => { if (!cancelled) setFiles(rows); })
      .catch(error => { if (!cancelled) setMessage(error instanceof Error ? error.message : "No se pudieron cargar las actas."); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [campaignId, revision]);
  async function single(file: RtdEvidence, preview: boolean) {
    setBusy(true); setMessage("");
    const tab = preview ? window.open("about:blank", "_blank") : null;
    if (tab) tab.opener = null;
    try {
      const blob = await downloadRtdEvidence(file, await ensureRadarAccessToken());
      if (tab) { const url = URL.createObjectURL(blob); tab.location.href = url; window.setTimeout(() => URL.revokeObjectURL(url), 60000); }
      else save(blob, file.file_name);
    } catch (error) { tab?.close(); setMessage(error instanceof Error ? error.message : "No se pudo abrir el acta."); }
    finally { setBusy(false); }
  }
  async function bulk() {
    setBusy(true); setMessage("Preparando actas…");
    try {
      const { zipSync } = await import("fflate");
      let contents: Record<string, Uint8Array> = {}; let bytes = 0; let part = 1;
      const flush = () => { const zipped = zipSync(contents, { level: 0 }); save(new Blob([new Uint8Array(zipped).buffer], { type: "application/zip" }), `RADAR-actas-${campaignId}-parte-${part++}.zip`); contents = {}; bytes = 0; };
      for (let i = 0; i < files.length; i++) {
        if (!alive.current) return;
        setMessage(`Descargando acta ${i + 1} de ${files.length}…`);
        const blob = await downloadRtdEvidence(files[i], await ensureRadarAccessToken());
        if (bytes && bytes + blob.size > 100 * 1024 * 1024) flush();
        contents[actaPath(files[i])] = new Uint8Array(await blob.arrayBuffer()); bytes += blob.size;
      }
      if (bytes) flush();
      setMessage(`Descarga preparada: ${files.length} actas en ${part - 1} ZIP. Si tu navegador lo solicita, permite las descargas múltiples.`);
    } catch (error) { setMessage(`Descarga interrumpida; no está completa. ${error instanceof Error ? error.message : "Intenta nuevamente."}`); }
    finally { if (alive.current) setBusy(false); }
  }
  return <section className="rtd-actas"><header><div><small>ARCHIVO DOCUMENTAL</small><h3>Actas recibidas <span>{files.length}</span></h3><p>Todas las elecciones de esta campaña. Municipio → centro → JRV → elección.</p></div><nav><button type="button" disabled={busy || loading} onClick={() => { setMessage(""); setRevision(value => value + 1); }}>Actualizar</button><button type="button" disabled={busy || loading || !files.length} onClick={() => setExpanded(value => !value)}>{expanded ? "Ocultar actas" : "Ver actas"}</button><button type="button" disabled={busy || loading || !files.length} onClick={() => void bulk()}>{busy ? "Procesando…" : "Descargar todas · ZIP"}</button></nav></header>
    <p role="status">{loading ? "Consultando archivos autorizados…" : message || (!files.length ? "Aún no hay actas cargadas en esta campaña." : "Las descargas mayores de 100 MB se dividen en varios ZIP.")}</p>
    {expanded ? <><div className="rtd-acta-files">{files.slice(page * 25, page * 25 + 25).map(file => <article key={file.id}><div><b>JRV {file.jrv_number} · {file.center_name}</b><small>{file.election_type.replaceAll("_", " ")} · {file.status} · {file.file_name}</small></div><nav><button type="button" disabled={busy} onClick={() => void single(file, true)}>Ver</button><button type="button" disabled={busy} onClick={() => void single(file, false)}>Descargar</button></nav></article>)}</div><nav><button type="button" disabled={!page} onClick={() => setPage(value => value - 1)}>Anterior</button><span>Página {page + 1}</span><button type="button" disabled={(page + 1) * 25 >= files.length} onClick={() => setPage(value => value + 1)}>Siguiente</button></nav></> : null}
  </section>;
}
