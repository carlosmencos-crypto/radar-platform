import path from "node:path";
import { pathToFileURL } from "node:url";

const root = process.cwd();
const sourcePath = path.join(root, "scripts/render-interaction-0509.mjs");

// The interaction smoke now asserts both the canonical RTD headline and the
// five-acta fiscal detail directly, so no runtime source patch is required.
await import(pathToFileURL(sourcePath).href);
