import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const sourcePath = path.join(root, "scripts/render-interaction-0509.mjs");
const original = fs.readFileSync(sourcePath, "utf8");

// V70 Golden renders RTD progress as "0 de N". Keep the product DOM/copy untouched
// and align only the QA assertion that previously expected the obsolete "0 / N" form.
const obsoleteAssertion = String.raw`/0\\s*\\/\\s*\\d+/`;
const canonicalAssertion = String.raw`/0\\s+de\\s+\\d+/i`;
if (!original.includes(obsoleteAssertion)) {
  throw new Error("Expected obsolete RTD progress assertion was not found; inspect the canonical interaction smoke before changing QA behavior.");
}

const patched = original.replace(obsoleteAssertion, canonicalAssertion);
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "radar-v70-interaction-canonical-"));
const tempFile = path.join(tempDir, "render-interaction-0509.mjs");
fs.writeFileSync(tempFile, patched, "utf8");

try {
  await import(pathToFileURL(tempFile).href);
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
