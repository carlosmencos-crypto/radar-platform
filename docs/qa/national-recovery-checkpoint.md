# National QA recovery checkpoint

Recovery starts from published commit 4c375d42f63a4423f63bfe7352329e60a4de5ee7.
The unavailable local commits b0606ab and 1061521 have not been recovered or represented as recovered.

Verified Supabase state on 2026-09-22: 340 intelligence profiles, 340 active voter profiles,
340 TSE Agreement 327 bases, zero basis/profile municipality mismatches,
340 profiles with four historical councils and 340 documented 2023 mayors.

The five restored SQL files were read from supabase_migrations.schema_migrations;
they were not regenerated or reapplied. The bases fixture is a read-only export of
public municipal electoral bases. It contains no private campaign records.

This checkpoint restores official population binding, municipal slate slots including
substitutes, historical party colors, official council sources, notes and titular bar totals.

Validation: 79 tests; typecheck; lint (zero warnings/errors); XLSX; 340 smoke;
V70 parity smoke; production build. Local environment uses Node 24; CI uses Node 22.
Browser/authenticated QA remains pending. PDM semantic integration, full premium
section parity, fiscal benchmark and full final acceptance remain pending.

National QA must deploy only to its dedicated Cloudflare project. Its GitHub Pages
deploy job is skipped to avoid replacing the shared Pages/Golden destination.
