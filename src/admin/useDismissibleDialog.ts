import { useEffect, useRef } from "react";

/** One keyboard/focus contract for daily-operation drawers and technical dialogs. */
export function useDismissibleDialog(open: boolean, onClose: () => void, busy = false) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
    const dialog = dialogs[dialogs.length - 1];
    const focusable = () => Array.from(dialog?.querySelectorAll<HTMLElement>('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]') ?? []).filter(el => el.getClientRects().length);
    focusable()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      const activeDialogs = document.querySelectorAll<HTMLElement>('[role="dialog"]');
      if (dialog !== activeDialogs[activeDialogs.length - 1]) return;
      if (event.key === "Escape" && !busy) { event.preventDefault(); close.current(); }
      if (event.key === "Tab") {
        const elements = focusable(); const first = elements[0]; const last = elements[elements.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [open, busy]);
}
