#!/usr/bin/env python3
"""Prepare immutable private batches, then resume only unacknowledged uploads.

Requires a validated source report and an explicitly provisioned import job.
Neither raw payloads nor the expiring token belong in the Git repository.
"""
import argparse
import gzip
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import time
import urllib.error
import urllib.request


def plan(directory):
    report = json.loads((directory / "national-nominal-2023-report.json").read_text())
    if report["status"] != "PASS":
        raise ValueError("Source reconciliation and municipal name review must pass first")
    target = directory / "batches"
    target.mkdir(mode=0o700)
    connection = sqlite3.connect(f"file:{directory / 'national-nominal-2023.sqlite'}?mode=ro", uri=True)
    connection.row_factory = sqlite3.Row
    cursor = connection.execute("select id,municipality_code,community,full_name,age_base,identification,source_file_id,source_row from electors order by id")
    batches = []
    while rows := cursor.fetchmany(10000):
        payload = json.dumps([dict(row) for row in rows], ensure_ascii=False, separators=(",", ":")).encode()
        number = len(batches) + 1
        file = target / f"{number:04d}.json.gz"
        with gzip.open(file, "wb", compresslevel=5) as output:
            output.write(payload)
        os.chmod(file, 0o600)
        batches.append({"batch_number": number, "payload_sha256": hashlib.sha256(payload).hexdigest(), "expected_rows": len(rows), "bytes": len(payload)})
    connection.close()
    token = secrets.token_hex(32)
    token_file = directory / "import-token"
    token_file.write_text(token)
    os.chmod(token_file, 0o600)
    manifest = {"source_sha256": report["source_sha256"], "source_year": 2023,
        "expected_rows": report["total_rows"], "token_sha256": hashlib.sha256(token.encode()).hexdigest(), "batches": batches}
    (directory / "batch-manifest.json").write_text(json.dumps(manifest, indent=2)+"\n")
    print(json.dumps({"batches": len(batches), "rows": sum(b["expected_rows"] for b in batches), "max_payload_bytes": max(b["bytes"] for b in batches)}))


def upload(directory, source_id, endpoint, limit):
    manifest = json.loads((directory / "batch-manifest.json").read_text())
    token = (directory / "import-token").read_text().strip()
    receipt_file = directory / "upload-receipts.jsonl"
    # Receipts are written only after the server confirms the expected count.
    completed = {r["batch"] for line in receipt_file.read_text().splitlines() if (r := json.loads(line)).get("source_id") == source_id} if receipt_file.exists() else set()
    sent = 0
    for batch in manifest["batches"]:
        number = batch["batch_number"]
        if number in completed:
            continue
        payload = gzip.decompress((directory / "batches" / f"{number:04d}.json.gz").read_bytes())
        if hashlib.sha256(payload).hexdigest() != batch["payload_sha256"]:
            raise ValueError(f"Local payload changed: batch {number}")
        body = json.dumps({"source_id": source_id, "batch_number": number, "payload": payload.decode()}, ensure_ascii=False).encode()
        for attempt in range(4):
            try:
                request = urllib.request.Request(endpoint, data=body, headers={"content-type":"application/json", "x-radar-import-token":token})
                with urllib.request.urlopen(request, timeout=90) as response:
                    receipt = json.load(response)
                if receipt.get("batch") != number or receipt.get("rows") != batch["expected_rows"]:
                    raise ValueError(f"Server count mismatch: batch {number}")
                break
            except urllib.error.HTTPError as error:
                if error.code < 500 or attempt == 3:
                    raise RuntimeError(f"Batch {number} rejected: HTTP {error.code}; no private payload logged") from None
                time.sleep(2 ** attempt)
            except (TimeoutError, urllib.error.URLError):
                if attempt == 3:
                    raise RuntimeError(f"Batch {number} network failure; retry is idempotent") from None
                time.sleep(2 ** attempt)
        receipt["source_id"] = source_id
        with receipt_file.open("a") as output:
            output.write(json.dumps(receipt)+"\n")
        print(json.dumps({"batch":number,"rows":receipt["rows"],"completed":len(completed)+sent+1,"total_batches":len(manifest["batches"])}), flush=True)
        sent += 1
        if limit and sent >= limit:
            break


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["plan", "upload"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--source-id")
    parser.add_argument("--endpoint")
    parser.add_argument("--limit", type=int, default=0)
    args = parser.parse_args()
    if args.action == "plan":
        plan(args.directory)
    else:
        if not args.source_id or not args.endpoint or not args.endpoint.startswith("https://"):
            parser.error("upload requires source-id and HTTPS endpoint")
        upload(args.directory, args.source_id, args.endpoint, args.limit)
