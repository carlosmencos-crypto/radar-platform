# V70 Canonical → National Runtime Port Map

This inventory drives the exact V70 port. Presentation is preserved from the canonical source; only data providers/context are replaced.

| Canonical V70 block/source | National provider | Rule |
|---|---|---|
| `municipio-360/page.tsx` shell/DOM/classes | reusable authenticated municipal component | preserve composition/classes; parameterize values only |
| `radar-data.ts` municipal KPIs | `radar_authorized_runtime_v6` + Data Vault layers | no 0509 literals |
| active voter register 2026 | `NUCLEO_ELECTORAL` / voter runtime | preserve TSE universe |
| electorate sex/literacy/age | TSE 2026 nucleus where validated; 2023 detailed aggregate kept separate | never substitute one universe for another |
| Censo / urban-rural / households | `INE_CENSO_B2_B6` + demographic runtime | show source period explicitly |
| 2026 population projection | demographic runtime v5+ | projection is not voter register |
| `centers` / voting center geography | `TSE_CENTROS_GEO` + authorized geo bundle | center geography only; JRV/electors remain separate |
| JRV counts/ranges | validated national TSE JRV product (24,427 reconciled) | join by canonical municipality/center contract; do not infer from coordinates |
| `El voto centro por centro` results | TSE TREP/Memoria products where validated at center grain | fail closed where center-result grain is not yet promoted; preserve the full UI structure |
| Corporacion Municipal ranking | `NUCLEO_ELECTORAL` + validated 2023 municipal results/detail | preserve winner, runner-up, margin, valid-vote denominator and ranking semantics |
| `historical-data.ts` | validated Memorias 2011/2015/2019/2023 | do not mix TREP with Memoria; expose only validated periods |
| communities / prioritization | voter community aggregates (26,009 / 8,947,471 reconciled) | aggregate-only; no PII |
| territorial crosswalk | INE places + explicit crosswalk statuses | ambiguous/no-match records remain explicit; no fabricated coordinates |
| schools | `MINEDUC_ESCUELAS` + authorized geo bundle | preserve source coverage semantics |
| health | `MSPAS_SALUD` + authorized geo bundle | keep 1003/1217 source exceptions explicit in traceability |
| works | `SNIP_2026` + validated municipal works universe | municipal works and SNIP remain separate; OBR-GEO/AVANCE fail closed until reproducible source |
| procurement | `GUATECOMPRAS` | keep procurement grain/source labels |
| finance | `MINFIN_HIST` + `MINFIN_YTD` | historical full-year and YTD stay visually/semantically separate |
| assets | optional `ACTIVOS_RESUMEN` for validated municipalities | only render when validated; never inflate baseline layer count |
| security/risk | `CONRED_INFORM` + validated source products | no manual risk polygons without official geography |
| forest/protected areas | `INAB_FORESTAL`, `CONAP_SIGAP` | no-association ≠ zero |
| SESAN | `SESAN_TALLA` | preserve source population/universe |
| PDM/PDM-OT | `PDM_PDMOT` catalog/detail when validated | missing document is documentary gap, not zero |
| Map Inteligente Leaflet presentation | authenticated synchronized map engine | preserve V70 appearance/controls while using a provider that does not break pan/zoom |
| Campaign modules | Campaign Vault | never substitute demo/public municipal data for private campaign records |

## First implementation tranche

1. Exact `Perfil del electorado` structure.
2. Exact `El voto centro por centro` structure with national center/JRV bindings.
3. Exact Corporacion Municipal presentation.
4. Exact historical-electoral block.
5. Preserve/add `Lo que define el municipio` only after canonical blocks.
6. Keep traceability collapsed/secondary.

## Acceptance

- 0509 must regress visually/functionally against published V70 before 1901/sample validation.
- A missing secondary datum may hide/de-emphasize its value, but may not replace the canonical V70 composition with generic cards.
- National runtime/security tests continue to gate all changes.
