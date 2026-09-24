# Public planning product reconciliation — 2026-09-24

Compared the retained validated products with the fixture at published code
`73b0091a0ff30d6673c568ee300e11ddd0f9ea13`. This is a source reconciliation,
not new municipal content, live database verification or final acceptance.

## Verified reuse

- All 340 municipal poverty entries exactly match the retained product, including
  provenance and nulls.
- All 36 previously validated priorities for 0501/0502/0513 are present unchanged.
- All 12 baseline/target indicators for 0509 are present unchanged.
- The fixture contains 28 additional directly reviewed diagnoses, making 64
  priorities in total. Those direct reviews were not re-extracted in this check.
- All 340 catalog file identities match the fixture; every planning entry keeps
  its own municipality code. No mismatch was found.

Do not reload these matched entries or reread their PDFs merely to regenerate
the same content. Six plans remain partial, 329 await semantic content review,
and five have no document in the inventory. These counts describe integration
status; they are not an estimate of how many entire documents must be reread.

## What the older inventory actually established

The retained Master Sources v1.60 (2026-07-29) contains 335 PDM records: 331
`PENDING_REVIEW`, three `VALIDATED_WITH_DOCUMENTED_EXCEPTIONS`, and one
`VALIDATED_0509_TERRITORY_AND_INFRASTRUCTURE_BASELINE`.

The current fetched catalog explicitly says it validates document availability,
not the internal content of the 335 PDFs. The July audit's 335 `READY` master rows
likewise refer to catalog entries, not 335 completed semantic reviews.

Sources read:

- [National catalog](https://docs.google.com/spreadsheets/d/1Nv88WadY3pVIWmaqNaFEF1WxigoaemEDbaT68QICSY4/edit)
- [July inventory audit v2](https://docs.google.com/spreadsheets/d/1h0Xwhf-BHkChfRhL9WIBJTNt4oDdrSBb/edit)
- [Validated priorities](https://docs.google.com/spreadsheets/d/19lzoDvf9xQ8256mRGk7mqj-wsIEng2b9/edit)
- [Baseline indicators](https://docs.google.com/spreadsheets/d/17C8sS9MS0o1qdbdZeu6-KNaYa73gydmp/edit)

Discovery also located a separate 0509 territory/community product
`1lXTMJqWcSRL9N1TD332o0hDD8HUj7Gbb` and its validation
`11wV4lLdKB_JzOrf18t5igNhusJ6nPwQq`. Its current integration still needs
field-level comparison; discovery alone does not mean it is absent or ready
for an additional load. No exhaustive claim about later Vault products is made.

## Reproduction and next work

Run `scripts/reconcile-planning-products.py` with the retained source directory,
DR-102 index and output path. The JSON report records readable-export hashes,
the fixture hash and a per-municipality comparison. It makes no database writes.
Retained input exports remain in the existing source workspace; the original
Drive files are unchanged.

Continue reconciling later products and the separate territory content before
starting new PDF review. Only unmatched evidence requires further integration.
Missing institutional sources remain explicit; unreviewed available content
must not be reclassified as unavailable. National semantic and functional
acceptance remains open.
