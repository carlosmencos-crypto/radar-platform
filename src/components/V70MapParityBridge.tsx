import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { V70OperationalMap } from "./V70OperationalMap";

export function V70MapParityBridge() {
  const [host, setHost] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const main = document.querySelector<HTMLElement>(".portal-main");
    const topbar = main?.querySelector<HTMLElement>(":scope > header.portal-topbar");
    if (!main || !topbar) return;

    const existing = main.querySelector<HTMLElement>("[data-v70-map-slot]");
    const slot = existing ?? document.createElement("div");
    slot.dataset.v70MapSlot = "true";
    slot.style.display = "contents";
    if (!existing) topbar.insertAdjacentElement("afterend", slot);

    const previous = Array.from(main.children)
      .filter((node): node is HTMLElement => node instanceof HTMLElement && node !== topbar && node !== slot)
      .map((node) => ({ node, hidden: node.hidden }));
    previous.forEach(({ node }) => { node.hidden = true; });
    setHost(slot);

    return () => {
      previous.forEach(({ node, hidden }) => { node.hidden = hidden; });
      if (!existing) slot.remove();
      setHost(null);
    };
  }, []);

  return host ? createPortal(<V70OperationalMap />, host) : null;
}
