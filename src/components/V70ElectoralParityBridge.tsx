import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";
import { getInstalledRadarElectoralLayers, getInstalledRadarGeoBundle } from "../data/radarRuntimeCache";
import { adaptAuthorizedElectoralTerritoryLayers, type V70ElectoralViewModel } from "../data/v70ElectoralAdapter";
import { V70CanonicalRich0509 } from "./V70CanonicalRich0509";
import { V70ElectoralTerritory } from "./V70ElectoralTerritory";
import { V70ElectoralTerritoryUnavailable } from "./V70ElectoralTerritoryUnavailable";

function resolveViewModel(municipalityCode: string): V70ElectoralViewModel | null {
  const layers = getInstalledRadarElectoralLayers(municipalityCode) ?? [];
  if (!layers.some((layer) => layer.layer_id === "TREP_2023_CENTER_INDEX")) return null;
  try {
    return adaptAuthorizedElectoralTerritoryLayers(layers);
  } catch (error) {
    console.error("RADAR_V70_ELECTORAL_ADAPTER_FAIL_CLOSED", municipalityCode, error);
    return null;
  }
}

export function V70ElectoralParityBridge() {
  const authorized = useAuthorizedRadarRuntime();
  const municipality_code = authorized.municipality.code;
  const municipality_name = authorized.municipality.displayName ?? authorized.municipality.name;
  const [host, setHost] = useState<HTMLElement | null>(null);
  const electoralView = useMemo(() => resolveViewModel(municipality_code), [municipality_code]);
  const geoBundle = getInstalledRadarGeoBundle(municipality_code);

  useEffect(() => {
    const profile = document.querySelector<HTMLElement>(".electorate-profile");
    if (!profile) return;

    const existing = document.querySelector<HTMLElement>(`[data-v70-electoral-slot="${municipality_code}"]`);
    const slot = existing ?? document.createElement("div");
    slot.dataset.v70ElectoralSlot = municipality_code;
    slot.style.display = "contents";
    if (!existing) profile.insertAdjacentElement("afterend", slot);

    const hidden: Array<{ node: HTMLElement; previous: boolean }> = [];
    const hide = (node?: HTMLElement | null) => {
      if (!node) return;
      hidden.push({ node, previous: node.hidden === true });
      node.hidden = true;
    };

    const genericTerritorial = Array.from(document.querySelectorAll<HTMLElement>("section.section")).find((section) =>
      section.querySelector("h2")?.textContent?.trim() === "El municipio sobre el mapa",
    );
    hide(genericTerritorial);

    if (municipality_code === "0509") {
      const genericDefinition = Array.from(document.querySelectorAll<HTMLElement>("section.section")).find((section) =>
        section.querySelector("h2")?.textContent?.trim() === "Lo que define el municipio",
      );
      hide(genericDefinition);
      document.querySelectorAll<HTMLElement>(".portal-content > .trace-note, .portal-content > .canonical-coverage-secondary").forEach(hide);
    }

    setHost(slot);

    return () => {
      hidden.forEach(({ node, previous }) => { node.hidden = previous; });
      if (!existing) slot.remove();
      setHost(null);
    };
  }, [municipality_code]);

  if (!host) return null;
  return createPortal(
    <>
      {electoralView
        ? <V70ElectoralTerritory viewModel={electoralView} geoBundle={geoBundle} />
        : <V70ElectoralTerritoryUnavailable municipalityName={municipality_name} geoBundle={geoBundle} state="NO_PUBLICADO" />}
      {municipality_code === "0509" ? <V70CanonicalRich0509 /> : null}
    </>,
    host,
  );
}
