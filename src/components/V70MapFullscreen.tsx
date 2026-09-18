import { useEffect, useState, type RefObject } from "react";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  onChange?: (active: boolean) => void;
};

export function V70MapFullscreen({ targetRef, onChange }: Props) {
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(typeof document !== "undefined" && "fullscreenEnabled" in document && document.fullscreenEnabled);
    const sync = () => {
      const next = document.fullscreenElement === targetRef.current;
      setActive(next);
      onChange?.(next);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    };
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [onChange, targetRef]);

  async function toggle() {
    if (!targetRef.current || !supported) return;
    if (document.fullscreenElement === targetRef.current) await document.exitFullscreen();
    else await targetRef.current.requestFullscreen();
  }

  return <button
    type="button"
    className={`map-fullscreen-button ${active ? "active" : ""}`}
    aria-label={active ? "Salir de pantalla completa" : "Ver mapa en pantalla completa"}
    title={active ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
    disabled={!supported}
    onClick={() => void toggle()}
  >
    <span className="map-fullscreen-icon" aria-hidden="true">{active ? "×" : "⛶"}</span>
    <span className="map-fullscreen-label">{active ? "Salir" : "Pantalla completa"}</span>
  </button>;
}
