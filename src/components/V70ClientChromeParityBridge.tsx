import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";

type RouteChrome = {
  eyebrow: string;
  title: string;
  accountRole: string;
  dayDNext?: boolean;
};

const chromeBySection: Record<string, RouteChrome> = {
  inicio: { eyebrow: "CENTRO DE MANDO", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  inteligencia: { eyebrow: "EXPEDIENTE MUNICIPAL 360", title: "San José / Puerto San José", accountRole: "Cuenta del municipio", dayDNext: true },
  estrategia: { eyebrow: "ESTRATEGIA", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  directorio: { eyebrow: "RELACIONES", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  agenda: { eyebrow: "OPERACIÓN", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  mapa: { eyebrow: "TERRITORIO Y OPERACIÓN", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  "dia-d": { eyebrow: "OPERACIÓN ELECTORAL", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  recursos: { eyebrow: "OPERACIÓN", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  pulso: { eyebrow: "INVESTIGACIÓN", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  "ia-radar": { eyebrow: "ASISTENCIA INTERNA", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
  configuracion: { eyebrow: "CUENTA", title: "San José / Puerto San José · Escuintla", accountRole: "Dirección de campaña" },
};

export function V70ClientChromeParityBridge() {
  const { section } = useParams();
  const { municipality_code } = useMunicipalityContext();

  useEffect(() => {
    if (municipality_code !== "0509") return;
    const activeSection = section || "inicio";
    const chrome = chromeBySection[activeSection] ?? chromeBySection.inicio;
    const accountName = document.querySelector<HTMLElement>(".sidebar-account button span b");
    const accountRole = document.querySelector<HTMLElement>(".sidebar-account button span small");
    const accountBadge = document.querySelector<HTMLElement>(".sidebar-account button i");
    const topbarEyebrow = document.querySelector<HTMLElement>(".portal-topbar > div > small");
    const topbarTitle = document.querySelector<HTMLElement>(".portal-topbar > div > b");
    const dayDLink = Array.from(document.querySelectorAll<HTMLAnchorElement>(".portal-sidebar nav a")).find((link) => link.querySelector("b")?.textContent?.trim() === "Día D");
    const existingDayDNext = dayDLink?.querySelector<HTMLElement>(":scope > small") ?? null;
    const previous = {
      accountName: accountName?.textContent ?? null,
      accountRole: accountRole?.textContent ?? null,
      accountBadge: accountBadge?.textContent ?? null,
      topbarEyebrow: topbarEyebrow?.textContent ?? null,
      topbarTitle: topbarTitle?.textContent ?? null,
      dayDNext: existingDayDNext?.textContent ?? null,
    };

    if (accountName) accountName.textContent = "Carlos Mencos";
    if (accountRole) accountRole.textContent = chrome.accountRole;
    if (accountBadge && !accountBadge.querySelector("img")) accountBadge.textContent = "CM";
    if (topbarEyebrow) topbarEyebrow.textContent = chrome.eyebrow;
    if (topbarTitle) topbarTitle.textContent = chrome.title;

    let insertedDayDNext: HTMLElement | null = null;
    if (chrome.dayDNext && dayDLink && !existingDayDNext) {
      insertedDayDNext = document.createElement("small");
      insertedDayDNext.textContent = "PRÓXIMO";
      dayDLink.appendChild(insertedDayDNext);
    } else if (!chrome.dayDNext && existingDayDNext) {
      existingDayDNext.hidden = true;
    }

    return () => {
      if (accountName && previous.accountName !== null) accountName.textContent = previous.accountName;
      if (accountRole && previous.accountRole !== null) accountRole.textContent = previous.accountRole;
      if (accountBadge && previous.accountBadge !== null && !accountBadge.querySelector("img")) accountBadge.textContent = previous.accountBadge;
      if (topbarEyebrow && previous.topbarEyebrow !== null) topbarEyebrow.textContent = previous.topbarEyebrow;
      if (topbarTitle && previous.topbarTitle !== null) topbarTitle.textContent = previous.topbarTitle;
      if (insertedDayDNext) insertedDayDNext.remove();
      if (existingDayDNext) {
        existingDayDNext.hidden = false;
        if (previous.dayDNext !== null) existingDayDNext.textContent = previous.dayDNext;
      }
    };
  }, [municipality_code, section]);

  return null;
}
