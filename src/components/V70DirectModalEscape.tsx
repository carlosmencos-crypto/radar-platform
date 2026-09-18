import { useEffect } from "react";

/** Closes the visible dialog with Escape or by touching its backdrop. */
export function V70DirectModalEscape() {
  useEffect(() => {
    function closeTopLayer(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;

      const dialogs = Array.from(document.querySelectorAll<HTMLElement>('[role="dialog"][aria-modal="true"]'))
        .filter((dialog) => {
          const style = window.getComputedStyle(dialog);
          return dialog.getClientRects().length > 0 && style.display !== "none" && style.visibility !== "hidden";
        });
      const dialog = dialogs.at(-1);
      if (dialog) {
        const close = dialog.querySelector<HTMLElement>(
          '[data-modal-close], button[aria-label="Cerrar"], button[aria-label^="Cerrar "], form > header button, section > header button, .export-head button',
        );
        if (close) {
          event.preventDefault();
          event.stopPropagation();
          close.click();
        }
        return;
      }

      const menuClose = document.querySelector<HTMLButtonElement>(".nav-scrim.visible");
      if (menuClose) {
        event.preventDefault();
        menuClose.click();
      }
    }

    function closeFromBackdrop(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const dialog = target.closest<HTMLElement>('[role="dialog"][aria-modal="true"]');
      if (!dialog || target !== dialog) return;
      const close = dialog.querySelector<HTMLElement>(
        '[data-modal-close], button[aria-label="Cerrar"], button[aria-label^="Cerrar "], form > header button, section > header button, .export-head button',
      );
      close?.click();
    }

    window.addEventListener("keydown", closeTopLayer, true);
    window.addEventListener("pointerdown", closeFromBackdrop, true);
    return () => {
      window.removeEventListener("keydown", closeTopLayer, true);
      window.removeEventListener("pointerdown", closeFromBackdrop, true);
    };
  }, []);

  return null;
}
