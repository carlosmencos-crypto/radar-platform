import { execFileSync } from "node:child_process";
import test from "node:test";

test("private import transport rejects incomplete acknowledgements and resumes confirmed batches", () => {
  execFileSync("python3", ["tests/verify-national-import-transport.py"], { encoding: "utf8" });
});
