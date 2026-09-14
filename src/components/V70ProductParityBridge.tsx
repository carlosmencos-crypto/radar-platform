import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useAuthorizedRadarRuntime } from "../context/AuthorizedRuntimeContext";

type ActiveVoterProfile = {
  total_active?: number;
  cutoff_at?: string;
  age_total?: Record<string, number>;
};

const AGE_BANDS = [
  ["18_25", "18–25"],
  ["26_30", "26–30"],
  ["31_35", "31–35"],
  ["36_40", "36–40"],
  ["41_45", "41–45"],
  ["46_50", "46–50"],
  ["51_55", "51–55"],
  ["56_60", "56–60"],
  ["61_65", "61–65"],
  ["66_70", "66–70"],
  ["70_plus", "70+"],
] as const;

function integer(value: number) {
  return new Intl.NumberFormat("es-GT", { maximumFractionDigits: 0 }).format(value);
}

function percent(value: number) {
  return value.toFixed(1);
}

function canonicalAsset(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base}${path.replace(/^\//, "")}`;
}

export function V70ProductParityBridge() {
  const authorized = useAuthorizedRadarRuntime();
  const municipalityCode = authorized.municipality.code;
  const runtime = authorized.runtime as typeof authorized.runtime & { elector_profile?: ActiveVoterProfile | null };
  const profile = runtime.elector_profile ?? null;
  const [ageHost, setAgeHost] = useState<HTMLElement | null>(null);

  const ages = useMemo(() => {
    const ageTotal = profile?.age_total;
    const total = profile?.total_active ?? 0;
    if (!ageTotal || total <= 0) return [];
    return AGE_BANDS.flatMap(([key, label]) => {
      const value = ageTotal[key];
      return typeof value === "number" && Number.isFinite(value)
        ? [{ key, label, value, share: value / total * 100 }]
        : [];
    });
  }, [profile]);

  useEffect(() => {
    const cleanup: Array<() => void> = [];
    const rememberText = (node: HTMLElement | null | undefined, text: string) => {
      if (!node) return;
      const previous = node.textContent ?? "";
      node.textContent = text;
      cleanup.push(() => { node.textContent = previous; });
    };
    const rememberHtml = (node: HTMLElement | null | undefined, html: string) => {
      if (!node) return;
      const previous = node.innerHTML;
      node.innerHTML = html;
      cleanup.push(() => { node.innerHTML = previous; });
    };

    const originals = new Map<HTMLImageElement, string>();
    document.querySelectorAll<HTMLImageElement>('img[src^="/brand/"]').forEach((image) => {
      originals.set(image, image.getAttribute("src") ?? "");
      image.src = canonicalAsset(image.getAttribute("src") ?? "");
    });
    cleanup.push(() => originals.forEach((src, image) => image.setAttribute("src", src)));

    const invented = Array.from(document.querySelectorAll<HTMLElement>("section.section")).find(
      (section) => section.querySelector("h2")?.textContent?.trim() === "Lo que define el municipio",
    );
    const inventedWasHidden = invented?.hidden ?? false;
    if (invented) invented.hidden = true;
    cleanup.push(() => { if (invented) invented.hidden = inventedWasHidden; });

    const eyebrow = document.querySelector<HTMLElement>(".electorate-profile .section-head .eyebrow");
    rememberText(eyebrow, "PERFIL DEL ELECTORADO · PADRÓN ACTIVO 2026");

    const titleMetric = document.querySelector<HTMLElement>(".age-profile .profile-title b");
    if (titleMetric && profile?.age_total && (profile.total_active ?? 0) > 0) {
      const young = ["18_25", "26_30", "31_35", "36_40"].reduce((sum, key) => sum + (profile.age_total?.[key] ?? 0), 0);
      rememberText(titleMetric, `${(young / (profile.total_active ?? 1) * 100).toFixed(1)}% tiene entre 18 y 40 años`);
    }

    if (municipalityCode === "0509") {
      rememberText(document.querySelector<HTMLElement>(".section-banner-copy > p"), "EXPEDIENTE MUNICIPAL 360 · ESCUINTLA — PUERTO SAN JOSÉ");

      const kpis = Array.from(document.querySelectorAll<HTMLElement>(".kpis > article"));
      rememberText(kpis[0]?.querySelector<HTMLElement>("em"), "INE · proyección oficial");
      rememberText(kpis[2]?.querySelector<HTMLElement>("em"), "103 JRV · auditoría completada");
      rememberText(kpis[3]?.querySelector<HTMLElement>("small"), "ORGANIZACIÓN COMUNITARIA TSE");
      rememberText(kpis[3]?.querySelector<HTMLElement>("b > i"), "registros");
      rememberText(kpis[3]?.querySelector<HTMLElement>("em"), "9 agrupaciones territoriales del municipio");

      rememberText(
        document.querySelector<HTMLElement>(".electorate-profile .section-head > p"),
        "Sexo, edad y alfabetismo provienen del padrón activo del TSE. La distribución urbana/rural pertenece al Censo 2018 y se muestra aparte para no mezclar universos.",
      );
      rememberText(document.querySelector<HTMLElement>(".register-total > span"), "PADRÓN ACTIVO");
      rememberHtml(
        document.querySelector<HTMLElement>(".register-total > div > small"),
        "personas frente al padrón electoral 2023<br>comparación indicativa: +5.0%",
      );
      rememberText(
        document.querySelector<HTMLElement>(".universe-block.current > small"),
        "Ciudadanos empadronados activos. La fuente actual no publica urbano/rural.",
      );
    }

    const host = document.querySelector<HTMLElement>(".age-profile .age-bars");
    const previous = host?.innerHTML ?? "";
    if (host && ages.length) {
      host.replaceChildren();
      setAgeHost(host);
      cleanup.push(() => { host.innerHTML = previous; });
    }

    return () => {
      cleanup.reverse().forEach((restore) => restore());
      setAgeHost(null);
    };
  }, [ages, municipalityCode, profile]);

  if (!ageHost || !ages.length) return null;
  const maxShare = Math.max(...ages.map((item) => item.share), 1);

  return createPortal(
    <>
      {ages.map((item) => <div key={item.key}>
        <span>{item.label}</span>
        <i><em style={{ width: `${item.share / maxShare * 100}%` }} /></i>
        <b>{integer(item.value)}</b>
        <small>{percent(item.share)}%</small>
      </div>)}
    </>,
    ageHost,
  );
}
