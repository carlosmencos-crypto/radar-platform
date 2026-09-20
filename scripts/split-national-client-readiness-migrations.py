#!/usr/bin/env python3
"""Split generated national profile migrations without changing their SQL rows."""

from __future__ import annotations

import argparse
from datetime import datetime, timedelta
from pathlib import Path


def parse_source(path: Path):
    text = path.read_text(encoding="utf-8")
    first_values = text.index("  values\n") + len("  values\n")
    first_boundary = text.index("\n)\ninsert into", first_values)
    second_start = text.index("\nwith input(\n", first_boundary) + 1
    second_values = text.index("  values\n", second_start) + len("  values\n")
    second_boundary = text.index("\n)\ninsert into", second_values)

    def rows_between(start: int, end: int):
        rows = []
        for line in text[start:end].splitlines():
            value = line.strip()
            if not value:
                continue
            rows.append(value[:-1] if value.endswith(",") else value)
        return rows

    profile_rows = rows_between(first_values, first_boundary)
    active_rows = rows_between(second_values, second_boundary)
    profile_by_code = {row[2:6]: row for row in profile_rows}
    active_by_code = {row[2:6]: row for row in active_rows}
    if set(profile_by_code) != set(active_by_code):
        raise ValueError(f"{path.name}: perfiles y padrón activo no coinciden")
    templates = (
        text[:first_values],
        text[first_boundary:second_start],
        text[second_start:second_values],
        text[second_boundary:],
    )
    return profile_by_code, active_by_code, templates


def render(codes, profiles, active, templates):
    profile_head, profile_tail, active_head, active_tail = templates
    return (
        profile_head
        + "    " + ",\n    ".join(profiles[code] for code in codes)
        + profile_tail
        + active_head
        + "    " + ",\n    ".join(active[code] for code in codes)
        + active_tail
    )


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("inputs", nargs="+", type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--max-bytes", type=int, default=300_000)
    args = parser.parse_args()

    profiles = {}
    active = {}
    templates = None
    for source in args.inputs:
        source_profiles, source_active, source_templates = parse_source(source)
        duplicates = set(profiles) & set(source_profiles)
        if duplicates:
            raise ValueError(f"Municipios duplicados: {sorted(duplicates)[:8]}")
        profiles.update(source_profiles)
        active.update(source_active)
        templates = templates or source_templates
    if len(profiles) != 340 or templates is None:
        raise ValueError(f"Contrato incompleto: {len(profiles)}/340")

    groups = []
    current = []
    for code in sorted(profiles):
        candidate = current + [code]
        if current and len(render(candidate, profiles, active, templates).encode("utf-8")) > args.max_bytes:
            groups.append(current)
            current = [code]
        else:
            current = candidate
    if current:
        groups.append(current)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    generated = []
    base = datetime(2026, 9, 19, 10, 0, 0)
    for index, codes in enumerate(groups):
        timestamp = (base + timedelta(minutes=index)).strftime("%Y%m%d%H%M%S")
        output = args.output_dir / f"{timestamp}_load_national_intelligence_profiles_part_{index + 1:02d}.sql"
        sql = render(codes, profiles, active, templates)
        size = len(sql.encode("utf-8"))
        if size > args.max_bytes and len(codes) > 1:
            raise ValueError(f"{output.name}: {size} bytes")
        output.write_text(sql, encoding="utf-8")
        generated.append((output.name, codes[0], codes[-1], len(codes), size))

    if sum(item[3] for item in generated) != 340:
        raise ValueError("Los lotes no cubren 340 municipios")
    for name, first, last, count, size in generated:
        print(f"{name}\t{first}-{last}\t{count}\t{size}")


if __name__ == "__main__":
    main()
