# Fiscal OCR restart fix, 8 October 2026

Root cause: src-CA_4_WxC.js imported bundler helpers from index-DACKz-qw.js, an executable obsolete application entry. Its first lazy import mounted another React root and re-bootstrapped the portal. Second use was cached. The isolated OCR chunk imports the same pure helpers from a side-effect-free module.

prepare.py pins the current live entry and original lazy module, applies patch.py, isolates the dependency, and creates an exact-file guarded release with backups. test-browser.mjs first reproduces the original restart/photo loss using the real module graph, then uses the actual worker/WASM/Spanish model on desktop and mobile to test first and second reads, reload during initialization, election recovery and assignment isolation. All API endpoints are local fixtures, no actas transmitted.

The older source.patch is historical reference only; it does not include these follow-up fixes. Latest deployment transformations are patch.py and isolate-ocr.py. Do not rebuild from the older Sites app without porting all deployed changes.
