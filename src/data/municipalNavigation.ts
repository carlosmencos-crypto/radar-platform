// Encode campaign scope in the URL so it survives reloads and new tabs.
export function withMunicipalScope(path: string, isDemo: boolean): string {
  const url = new URL(path, "https://radar.invalid");
  if (url.origin !== "https://radar.invalid" || !/^\/municipio\/\d{4}(?:\/|$)/.test(url.pathname)) {
    throw new Error("RADAR_INVALID_MUNICIPAL_DESTINATION");
  }
  if (isDemo) url.searchParams.set("demo", "1");
  else url.searchParams.delete("demo");
  return url.pathname + url.search + url.hash;
}
