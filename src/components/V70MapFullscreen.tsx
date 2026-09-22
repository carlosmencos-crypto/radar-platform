import { useEffect, useRef, useState, type RefObject } from "react";

type Props = {
  targetRef: RefObject<HTMLElement | null>;
  onChange?: (active: boolean) => void;
};

export function V70MapFullscreen({ targetRef, onChange }: Props) {
  const [active, setActive] = useState(false);
  const [fallback, setFallback] = useState(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const node = targetRef.current;
    const previousOverflow = document.body.style.overflow;
    const previousScroll = { left: window.scrollX, top: window.scrollY };
    node?.classList.toggle("is-fullscreen", fallback);
    if (fallback) document.body.style.overflow = "hidden";
    const sync = () => {
      const next = document.fullscreenElement === targetRef.current || fallback;
      setActive(next);
      onChangeRef.current?.(next);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 80);
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 320);
    };
    const exitWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (fallback) setFallback(false);
      else if (document.fullscreenElement === targetRef.current) void document.exitFullscreen().catch(() => undefined);
    };
    sync();
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("keydown", exitWithEscape);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("keydown", exitWithEscape);
      node?.classList.remove("is-fullscreen");
      if (fallback) {
        document.body.style.overflow = previousOverflow;
        if (node?.isConnected) window.scrollTo({ ...previousScroll, behavior: "instant" });
      }
    };
  }, [fallback, targetRef]);

  async function toggle() {
    if (!targetRef.current) return;
    if (fallback) { setFallback(false); return; }
    if (document.fullscreenElement === targetRef.current) {
      await document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (!document.fullscreenEnabled || !targetRef.current.requestFullscreen) {
      setFallback(true);
      return;
    }
    try { await targetRef.current.requestFullscreen(); }
    catch { setFallback(true); }
  }

  return <button
    type="button"
    className={`map-fullscreen-button ${active ? "active" : ""}`}
    aria-label={active ? "Salir de pantalla completa" : "Ver mapa en pantalla completa"}
    title={active ? "Salir de pantalla completa (Esc)" : "Pantalla completa"}
    onClick={() => void toggle()}
  >
    <span className="map-fullscreen-icon" aria-hidden="true">{active ? "×" : "⛶"}</span>
    <span className="map-fullscreen-label">{active ? "Salir" : "Pantalla completa"}</span>
  </button>;
}
