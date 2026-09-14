import { useEffect } from "react";
import { useParams } from "react-router-dom";
import { useMunicipalityContext } from "../context/MunicipalityContext";

const routeEyebrow: Record<string, string> = {
  inicio: "CENTRO DE MANDO",
  inteligencia: "EXPEDIENTE MUNICIPAL 360",
  estrategia: "ESTRATEGIA",
  directorio: "RELACIONES",
  agenda: "OPERACIÓN",
  mapa: "TERRITORIO Y OPERACIÓN",
  "dia-d": "OPERACIÓN ELECTORAL",
  recursos: "OPERACIÓN",
  pulso: "INVESTIGACIÓN",
  "ia-radar": "ASISTENCIA INTERNA",
  configuracion: "CUENTA",
};

export function V70ClientChromeParityBridge() {
  const { section } = useParams();
  const { municipality_code } = useMunicipalityContext();

  useEffect(() => {
    if (municipality_code !== "0509") return;
    const activeSection = section || "inicio";
    const accountName = document.querySelector<HTMLElement>(".sidebar-account button span b");
    const accountRole = document.querySelector<HTMLElement>(".sidebar-account button span small");
    const accountBadge = document.querySelector<HTMLElement>(".sidebar-account button i");
    const topbarEyebrow = document.querySelector<HTMLElement>(".portal-topbar > div > small");
    const topbarTitle = document.querySelector<HTMLElement>(".portal-topbar > div > b");
    const previous = {
      accountName: accountName?.textContent ?? null,
      accountRole: accountRole?.textContent ?? null,
      accountBadge: accountBadge?.textContent ?? null,
      topbarEyebrow: topbarEyebrow?.textContent ?? null,
      topbarTitle: topbarTitle?.textContent ?? null,
    };
    if (accountName) accountName.textContent = "Carlos Mencos";
    if (accountRole) accountRole.textContent = "Dirección de campaña";
    if (accountBadge && !accountBadge.querySelector("img")) accountBadge.textContent = "CM";
    if (topbarEyebrow) topbarEyebrow.textContent = routeEyebrow[activeSection] ?? topbarEyebrow.textContent;
    if (topbarTitle) topbarTitle.textContent = "San José / Puerto San José · Escuintla";
    return () => {
      if (accountName && previous.accountName !== null) accountName.textContent = previous.accountName;
      if (accountRole && previous.accountRole !== null) accountRole.textContent = previous.accountRole;
      if (accountBadge && previous.accountBadge !== null && !accountBadge.querySelector("img")) accountBadge.textContent = previous.accountBadge;
      if (topbarEyebrow && previous.topbarEyebrow !== null) topbarEyebrow.textContent = previous.topbarEyebrow;
      if (topbarTitle && previous.topbarTitle !== null) topbarTitle.textContent = previous.topbarTitle;
    };
  }, [municipality_code, section]);

  return null;
}
