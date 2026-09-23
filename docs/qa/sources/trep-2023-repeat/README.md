# Repeated municipal election, 20 August 2023

Recovered on 2026-09-23 from the official `https://segundaeleccion.trep.gt/` publication.
The site's config and application resolve `ext/jsonData_gtm2023/ultimoCorte.json`
to `1692574389/1692594771`. Its `gtm2023_datos.json` advertises:

https://segundaeleccion.trep.gt/ext/jsonData_gtm2023/1692574389/1692594771/GTM2023-segundaeleccion-20230820-231251.zip

The two CSV files are original bytes extracted from the `4-CORPORACIÓN/` directory.
The JSON files are gzip-decoded official department responses at the same cutoff.
Hashes and source URLs are recorded in the generated layer fixtures. The script
`scripts/recover-repeat-election.py` independently compares every party/mesa value,
integrity hash, center code, municipal total and retained JRV assignment. It fails
on duplicates, foreign municipalities, missing mesas or conflicting totals.

`retained-index.json` is the read-only public index before this recovery. Its
geographic holds and June source are preserved verbatim. The August crosswalk is
recorded separately: San José del Golfo uses code 3857 for mesas 2317–2319. Never
join solely on the June TREP center codes, or invent coordinates for held sites.

| Municipality | Captured | Counted | Calculated emitted | Party votes |
|---|---:|---:|---:|---:|
| 0104 San José del Golfo | 24/24 | 22/24 | 4,584 | 4,346 |
| 1104 San Martín Zapotitlán | 29/29 | 29/29 | 7,096 | 6,671 |

Limitations remain visible:

- 0104 mesas 2318 and 2319 are marked `Acta en Blanco`, uncounted. Do not add
  fabricated votes or claim 24 counted acts. The reported valid total is 4,345;
  the calculated sum of party votes is 4,346. Both are preserved.
- This is a preliminary TREP cutoff, not final legally binding election results.
  The existing official Memoria history is unchanged.
- Only the repeated municipal election is loaded here. August presidential runoff
  results must never fill a first-round presidential or legislative slot.
- The two recovered layers do not establish universal CLIENT_READY or overall
  semantic/visual national acceptance.

Institutional context:

- https://tse.org.gt/comunicacion/noticias/tse-repetira-elecciones-municipales-en-san-miguel-petapa-guatemala
- https://tse.org.gt/comunicacion/noticias/tse-presenta-informe-sobre-funcionamiento-del-sistema-informatico-empleado-en-las-elecciones

`scripts/load-repeated-municipal-election.sql` is an atomic, guarded data-only
transaction. It checks the exact retained index, refuses a conflicting existing
result, and accepts a repeat only if both results already match. It modifies no
permissions, source index, private campaign data, schema or readiness flag.
