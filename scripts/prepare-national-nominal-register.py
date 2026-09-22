#!/usr/bin/env python3
"""Recover the supplied 2023 register without publishing personal data.

Reads the original XLSX package as a stream, retains source coordinates and
creates a private SQLite staging database. The JSON report contains aggregates
only. Never point --output into the repository or the public build directory.
No records are deleted or merged based on repeated DPI.
"""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import tempfile
import unicodedata
import zipfile
from lxml import etree

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
DEPARTMENT_CODES = {2: 3, 3: 4, 4: 2}


def norm(value):
    value = unicodedata.normalize("NFKD", str(value or "")).upper()
    return " ".join(re.sub(r"[^A-Z0-9 ]", "", value).split())


def stream_elements(file, tag):
    for _, element in etree.iterparse(file, events=("end",), tag=NS + tag):
        yield element
        element.clear()
        while element.getprevious() is not None:
            del element.getparent()[0]


def shared_strings(book):
    if "xl/sharedStrings.xml" not in book.namelist():
        return []
    with book.open("xl/sharedStrings.xml") as stream:
        return ["".join(item.itertext()) for item in stream_elements(stream, "si")]


def row_values(row, strings):
    values = [None] * 8
    for cell in row:
        column = re.sub(r"[0-9]", "", cell.get("r", ""))
        if len(column) != 1 or not "A" <= column <= "H":
            continue
        value = cell.findtext(NS + "v")
        if cell.get("t") == "s" and value is not None:
            value = strings[int(value)]
        elif cell.get("t") == "inlineStr":
            value = "".join(cell.itertext())
        values[ord(column) - ord("A")] = value
    return values


def catalog(path):
    rows = re.findall(r'code:\s*"(\d{4})",\s*departmentCode:\s*"\d{2}",\s*name:\s*"([^"]+)",[^\n]*?department:\s*"([^"]+)"', path.read_text())
    if len(rows) != 340:
        raise ValueError("Canonical catalog must contain exactly 340 municipalities")
    return {code: (name, department) for code, name, department in rows}


def review_source_labels(report):
    review = json.loads(Path(__file__).with_name("nominal-register-name-variants.json").read_text())
    if report["status"] == "FAIL" or report["source_sha256"] != review["source_sha256"]:
        return report
    pairs = {tuple(pair) for pair in review["pairs"]}
    accepted = all(norm(source_department) == norm(item["canonical"][1])
        and (norm(source_name), norm(item["canonical"][0])) in pairs
        for item in report["name_differences"] for source_name, source_department in item["source"])
    if accepted:
        report["status"] = "PASS"
        report["name_review"] = review
    return report


def prepare(source, output, catalog_path):
    repository = Path(__file__).resolve().parent.parent
    if output.resolve().is_relative_to(repository):
        raise ValueError("Private register must stay outside the Git repository")
    output.mkdir(parents=True, exist_ok=True)
    os.chmod(output, 0o700)
    database = output / "national-nominal-2023.sqlite"
    if database.exists():
        raise ValueError("Existing staging database preserved; select a new output directory")
    reference = catalog(catalog_path)
    digest = hashlib.file_digest(source.open("rb"), "sha256").hexdigest()
    db = sqlite3.connect(database)
    os.chmod(database, 0o600)
    db.executescript("""
      pragma journal_mode=WAL;
      pragma synchronous=NORMAL;
      create table source_files(id integer primary key, file_name text, sheet_path text,
        unique(file_name, sheet_path));
      create table electors(id integer primary key, municipality_code text not null,
        source_municipality_code text not null, community text not null,
        full_name text not null, age_base integer, identification text not null,
        source_file_id integer not null references source_files(id), source_row integer not null,
        unique(source_file_id, source_row));
    """)
    counts, quality, source_names = Counter(), Counter(), {}
    progress = []
    with zipfile.ZipFile(source) as archive, tempfile.TemporaryDirectory() as temp:
        members = sorted([n for n in archive.namelist() if n.startswith("Departamentos/") and re.match(r"\d+ - .+\.xlsx$", Path(n).name)], key=lambda n: int(Path(n).name.split(" - ")[0]))
        if len(members) != 22:
            raise ValueError("Expected 22 source department workbooks")
        for member in members:
            extracted = Path(archive.extract(member, temp))
            with zipfile.ZipFile(extracted) as book:
                strings = shared_strings(book)
                sheets = sorted(n for n in book.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+.xml", n))
                for sheet in sheets:
                    source_id = db.execute("insert into source_files(file_name,sheet_path) values(?,?)", (member, sheet)).lastrowid
                    batch, sheet_count = [], 0
                    with book.open(sheet) as stream:
                        for row in stream_elements(stream, "row"):
                            source_row = int(row.get("r"))
                            if source_row == 1:
                                continue
                            values = row_values(row, strings)
                            if not any(values):
                                continue
                            dep, dep_name, local, muni_name, community, name, age, dpi = values
                            dep, local = int(dep), int(local)
                            code = f"{DEPARTMENT_CODES.get(dep, dep):02d}{local:02d}"
                            if code not in reference:
                                raise ValueError(f"Unknown municipal code in {member}, row {source_row}")
                            source_names.setdefault(code, set()).add((str(muni_name), str(dep_name)))
                            dpi = re.sub(r"\D", "", dpi or "")
                            name = " ".join((name or "").split())
                            if len(dpi) != 13 or not name:
                                raise ValueError(f"Invalid identity in {member}, row {source_row}; no partial publication")
                            age = int(float(age)) if age not in (None, "") else None
                            if age is None:
                                quality["AGE_EMPTY"] += 1
                            elif not 18 <= age <= 110:
                                quality["AGE_RANGE"] += 1
                            batch.append((code, f"{dep:02d}{local:02d}", " ".join((community or "").split()), name, age, dpi, source_id, source_row))
                            counts[code] += 1
                            sheet_count += 1
                            if len(batch) >= 10000:
                                db.executemany("insert into electors(municipality_code,source_municipality_code,community,full_name,age_base,identification,source_file_id,source_row) values(?,?,?,?,?,?,?,?)", batch)
                                db.commit()
                                batch.clear()
                    db.executemany("insert into electors(municipality_code,source_municipality_code,community,full_name,age_base,identification,source_file_id,source_row) values(?,?,?,?,?,?,?,?)", batch)
                    db.commit()
                    progress.append({"source_file": member, "sheet": sheet, "rows": sheet_count})
                    print(json.dumps(progress[-1], ensure_ascii=False), flush=True)
            extracted.unlink()
    print('{"phase":"reconciling"}', flush=True)
    db.execute("create index electors_municipality on electors(municipality_code,id)")
    db.execute("create index electors_identity on electors(identification)")
    duplicate_groups = db.execute("select count(*) from (select identification from electors group by identification having count(*)>1)").fetchone()[0]
    name_differences = [{"code": code, "canonical": reference[code], "source": sorted(pairs)} for code,pairs in sorted(source_names.items()) if any(norm(name)!=norm(reference[code][0]) or norm(dep)!=norm(reference[code][1]) for name,dep in pairs)]
    report = {"source_file": source.name, "source_sha256": digest, "source_year": 2023,
      "status": "REVIEW_NAMES" if name_differences else "PASS", "total_rows": sum(counts.values()),
      "municipalities": len(counts), "department_workbooks": len(members), "sheets": len(progress),
      "duplicate_identity_groups": duplicate_groups, "quality": dict(quality), "name_differences": name_differences,
      "municipal_counts": dict(sorted(counts.items())), "sources": progress,
      "public_payload_contains_personal_data": False,
      "database_loaded": False}
    if len(counts) != 340 or sum(counts.values()) != 8947471 or duplicate_groups != 11013 or dict(quality) != {"AGE_EMPTY":36,"AGE_RANGE":16}:
        report["status"] = "FAIL"
    db.commit()
    db.execute("pragma wal_checkpoint(truncate)")
    db.close()
    report = review_source_labels(report)
    (output / "national-nominal-2023-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps({k:v for k,v in report.items() if k not in ("municipal_counts","sources")}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("source", type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--catalog", type=Path, default=Path(__file__).resolve().parent.parent / "src/data/municipalities.ts")
    args = parser.parse_args()
    prepare(args.source, args.output, args.catalog)
