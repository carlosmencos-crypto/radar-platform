# RADAR V70 Golden Master Parity Contract

## Purpose

This branch exists to port the exact published RADAR Identidad Electoral V70 experience into the authenticated 340-municipality runtime without redesigning the product.

The implementation direction is **V70 original -> parameterization -> Supabase/Data Vault 340**, not a visual approximation of V70.

## Canonical source

- Project: `radar-identidad-electoral`
- Published URL: `https://radar-identidad-electoral.carlos-mencos.chatgpt.site/`
- Canonical published commit: `eb6359211867ac0a81163b0a0242ea86608da56e`
- Canonical publication artifact hash: `sha256:e782bbe983b98c051abceb2e98aec72173e0a634725b020c4bb993463437001a`
- Received source ZIP SHA-256: `964d06fb19399a1cba135c80874ad99cad644416656271bc7e1a68de049e41d2`
- Export manifest SHA-256: `bb15311d27677c989f2b6cae057f2a46abeac4b01581af1014c5c73ae999580c`

## Critical source fingerprints

- `app/municipio-360/page.tsx`: `7aad868c2af5daf741543588e978b71946d4852c52d8e7fc7a76c4b9e130a89d`
- `app/globals.css`: `72cb2595f0bd5c386c7530a30435f253244e83dfc157ef10ddd47af665bb9a57`
- `app/portal.css`: `b7b6e1d529f36a8f57fb201d599a31f59a788d76dee68ab0f4ac9f8c5bcaf7ec`
- `app/radar-brand-v3.css`: `2ec7c0b52fe34c51c511b74ebb0e454242e7a17247e4a248f4e23ece8f026554`
- `app/radar-data.ts`: `fe5d2e4fced084f92e829d0487d8fe6b8318990e54f1bec57073bf4b03c89e05`
- `app/historical-data.ts`: `d4941e27ac6922069b3fbdff67aff01cf49e2403f79636ba3c75094a1924030f`
- `app/mapa/page.tsx`: `559364012386e49810f3b1d3c62bcb93d4efe47bbe069ffe0375854cc388bac8`
- `app/page.tsx`: `e6faa7fc517dfb227e28ed2018b2dba65d2d9757adc7d7d9b1ef2704ad57f931`

The three canonical V70 CSS files already present in `src/styles/v70/` match the original Git blob fingerprints byte-for-byte. They must remain the visual source of truth.

## Non-negotiable parity

For the authenticated national product, 0509 is the regression golden master. The following must remain materially identical to V70 unless an explicitly approved national improvement is additive:

- typography family, size, weight, line height and hierarchy;
- spacing, padding, margins, card proportions and section rhythm;
- banners, titles, subtitles, eyebrow labels and microcopy hierarchy;
- RADAR color system, borders, shadows, radii and surfaces;
- sidebar, topbar, active/hover states, collapse behavior, dark mode and AA text control;
- tabs, selectors, filters, tooltips, popovers, modals and export/report interactions;
- Intelligence Municipal composition, including the electorate profile and its universe separation;
- `El voto centro por centro`, including election selector, metric selector, center directory, JRV context, map, center detail and results presentation;
- Corporacion Municipal ranking, winner/runner-up/margin/participation/acta context when supported by validated data;
- historical electoral presentation;
- territory, education, health, finance, works and executive-reading sections;
- Map Inteligente UX and synchronized geographic behavior;
- responsive and dark-mode behavior.

Approved additive improvement: `Lo que define el municipio` may remain, but it may not replace or simplify any canonical V70 block.

## Data rules

- A single component tree serves all 340 municipalities.
- Only data/context changes by `municipality_code + campaign_id + user_role + permissions`.
- Keep TSE, INE, MINFIN, SNIP, Guatecompras and Campaign Vault universes separate.
- Never convert missing data to zero.
- Never invent coordinates, results, JRV, participation, margins or financial values.
- Prefer hiding/de-emphasizing a secondary metric with no official equivalent over degrading the whole module with a prominent incomplete-state banner.
- Source/period limitations remain available in secondary traceability.
- No PII or Campaign Vault records in public bundles.

## Acceptance sequence

1. Port exact V70 structural composition into reusable national components.
2. Parameterize all 0509 literals and hardcoded datasets through runtime adapters.
3. Regression-test authenticated `0509` against the original V70 source/site.
4. Validate `1901` and a diverse municipal sample.
5. Run 340/340 route/runtime/data guards.
6. Run visual QA for light/dark, sidebar, responsive, maps, tabs and modals.
7. Do not merge/cut over `main`, `deploy-hostinger`, Hostinger or `radargt.wowlatam.com` until parity is explicitly approved.

## Build-policy note

The canonical V70 source build and its existing test pass. Standalone TypeScript/lint findings in the original export are inherited from V70 and are not to be 'fixed' inside the preserved golden master. The national implementation should continue to satisfy its own quality pipeline without mutating the reference source.
