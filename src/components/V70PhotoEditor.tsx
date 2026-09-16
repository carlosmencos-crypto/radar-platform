import { useEffect, useMemo, useRef, useState } from "react";

type V70PhotoEditorProps = {
  currentSrc?: string;
  onChange: (dataUrl: string) => void;
  onError?: (message: string) => void;
  privacyLabel?: string;
};

const OUTPUT_SIZE = 900;

export function V70PhotoEditor({
  currentSrc = "",
  onChange,
  onError,
  privacyLabel = "Opcional",
}: V70PhotoEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderRevision = useRef(0);
  const onChangeRef = useRef(onChange);
  const onErrorRef = useRef(onError);
  const [source, setSource] = useState<File | null>(null);
  const [zoom, setZoom] = useState(1);
  const [horizontal, setHorizontal] = useState(50);
  const [vertical, setVertical] = useState(50);
  const previewUrl = useMemo(
    () => (source ? URL.createObjectURL(source) : ""),
    [source],
  );

  useEffect(() => {
    onChangeRef.current = onChange;
    onErrorRef.current = onError;
  }, [onChange, onError]);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  useEffect(() => {
    if (!source || !previewUrl || !canvasRef.current) return;
    const revision = ++renderRevision.current;
    const image = new Image();
    image.onload = () => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext("2d");
      if (!canvas || !context) return;
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      context.fillStyle = "#F6F2EE";
      context.fillRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const baseScale = Math.max(
        OUTPUT_SIZE / image.naturalWidth,
        OUTPUT_SIZE / image.naturalHeight,
      );
      const scale = baseScale * zoom;
      const drawWidth = image.naturalWidth * scale;
      const drawHeight = image.naturalHeight * scale;
      const drawX = (OUTPUT_SIZE - drawWidth) * (horizontal / 100);
      const drawY = (OUTPUT_SIZE - drawHeight) * (vertical / 100);
      context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
      const result = canvas.toDataURL("image/jpeg", 0.92);
      if (revision === renderRevision.current) onChangeRef.current(result);
    };
    image.onerror = () =>
      onErrorRef.current?.("No se pudo procesar la fotografía.");
    image.src = previewUrl;
  }, [horizontal, previewUrl, source, vertical, zoom]);

  function selectPhoto(file: File | null) {
    if (file && file.size > 8 * 1024 * 1024) {
      onErrorRef.current?.("La fotografía debe pesar menos de 8 MB.");
      return;
    }
    setSource(file);
    setZoom(1);
    setHorizontal(50);
    setVertical(50);
  }

  return (
    <div className="photo-editor">
      <div className="photo-editor-selection">
        <span className="photo-editor-preview">
          {source ? (
            <canvas
              ref={canvasRef}
              aria-label="Vista previa de la fotografía ajustada"
            />
          ) : currentSrc ? (
            <img src={currentSrc} alt="Fotografía actual" />
          ) : (
            <i>FOTO</i>
          )}
        </span>
        <span className="photo-editor-file">
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => selectPhoto(event.target.files?.[0] ?? null)}
          />
          <small>
            {privacyLabel} · JPG, PNG o WebP · se guardará ajustada al círculo
          </small>
        </span>
      </div>
      {source ? (
        <div className="photo-editor-controls" aria-label="Ajustar fotografía">
          <label>
            <span>Acercar</span>
            <input
              type="range"
              min="1"
              max="2.5"
              step="0.05"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Mover horizontalmente</span>
            <input
              type="range"
              min="0"
              max="100"
              value={horizontal}
              onChange={(event) => setHorizontal(Number(event.target.value))}
            />
          </label>
          <label>
            <span>Mover verticalmente</span>
            <input
              type="range"
              min="0"
              max="100"
              value={vertical}
              onChange={(event) => setVertical(Number(event.target.value))}
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setHorizontal(50);
              setVertical(50);
            }}
          >
            Centrar fotografía
          </button>
        </div>
      ) : null}
    </div>
  );
}
