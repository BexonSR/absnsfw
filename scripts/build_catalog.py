#!/usr/bin/env python3
"""Validate data/catalog.json (the single source of truth for the CRIMSON catalog).

Usage:
    python scripts/build_catalog.py --check      # validate, exit 1 on problems
    python scripts/build_catalog.py --stats      # print a summary table
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

CATALOG = Path(__file__).resolve().parent.parent / "data" / "catalog.json"

REQUIRED_TITLE = {
    "id": str, "title": str, "titleWhite": str, "titleCrimson": str, "type": str,
    "category": str, "year": int, "rating": str, "match": str, "maturity": str,
    "genres": list, "synopsis": str, "seasons": dict,
}
REQUIRED_EPISODE = {"id": str, "season": int, "number": int, "code": str, "title": str, "duration": int}
REQUIRED_NOTIF = {"id": str, "titleId": str, "season": int, "heading": str, "text": str, "time": str}
REQUIRED_SUB = {"start": int, "end": int, "sub": str, "dub": str}
VALID_TYPES = {"anime", "movie"}
VALID_CATEGORIES = {"series", "movies"}


def check_fields(obj: dict, schema: dict, where: str, errors: list[str]) -> None:
    for key, expected in schema.items():
        if key not in obj:
            errors.append(f"{where}: missing '{key}'")
        elif not isinstance(obj[key], expected):
            errors.append(f"{where}: '{key}' should be {expected.__name__}, got {type(obj[key]).__name__}")


def validate(data: dict) -> list[str]:
    errors: list[str] = []
    for section in ("titles", "notifications", "subtitles"):
        if not isinstance(data.get(section), list) or not data[section]:
            errors.append(f"'{section}' must be a non-empty list")
    if errors:
        return errors

    title_ids: set[str] = set()
    episode_ids: set[str] = set()

    for t in data["titles"]:
        where = f"title '{t.get('id', '?')}'"
        check_fields(t, REQUIRED_TITLE, where, errors)
        if t.get("id") in title_ids:
            errors.append(f"{where}: duplicate id")
        title_ids.add(t.get("id"))
        if t.get("type") not in VALID_TYPES:
            errors.append(f"{where}: type must be one of {sorted(VALID_TYPES)}")
        if t.get("category") not in VALID_CATEGORIES:
            errors.append(f"{where}: category must be one of {sorted(VALID_CATEGORIES)}")
        if t.get("featured") and not (t.get("tagline") and t.get("badge")):
            errors.append(f"{where}: featured titles need 'tagline' and 'badge'")
        if not t.get("seasons"):
            errors.append(f"{where}: needs at least one season")
        for season, episodes in (t.get("seasons") or {}).items():
            if not episodes:
                errors.append(f"{where} season {season}: no episodes")
            for ep in episodes:
                ewhere = f"{where} episode '{ep.get('id', '?')}'"
                check_fields(ep, REQUIRED_EPISODE, ewhere, errors)
                if ep.get("id") in episode_ids:
                    errors.append(f"{ewhere}: duplicate episode id")
                episode_ids.add(ep.get("id"))
                if str(ep.get("season")) != str(season):
                    errors.append(f"{ewhere}: season field {ep.get('season')} != key {season}")

    for n in data["notifications"]:
        where = f"notification '{n.get('id', '?')}'"
        check_fields(n, REQUIRED_NOTIF, where, errors)
        if n.get("titleId") not in title_ids:
            errors.append(f"{where}: unknown titleId '{n.get('titleId')}'")

    prev_end = -1
    for i, s in enumerate(data["subtitles"]):
        where = f"subtitle #{i}"
        check_fields(s, REQUIRED_SUB, where, errors)
        if s.get("start", 0) > s.get("end", 0):
            errors.append(f"{where}: start > end")
        if s.get("start", 0) <= prev_end:
            errors.append(f"{where}: overlaps previous line")
        prev_end = s.get("end", prev_end)

    if not any(t.get("featured") for t in data["titles"]):
        errors.append("no featured title for the hero banner")
    if not any(t.get("popularMovie") for t in data["titles"]):
        errors.append("no popularMovie titles for the home row")
    return errors


def print_stats(data: dict) -> None:
    print(f"{'id':<20} {'type':<6} {'seasons':<8} {'episodes':<9} flags")
    for t in data["titles"]:
        eps = sum(len(v) for v in t["seasons"].values())
        flags = ("featured " if t.get("featured") else "") + ("popular" if t.get("popularMovie") else "")
        print(f"{t['id']:<20} {t['type']:<6} {len(t['seasons']):<8} {eps:<9} {flags}")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--check", action="store_true", help="validate the catalog")
    ap.add_argument("--stats", action="store_true", help="print a summary")
    args = ap.parse_args()

    data = json.loads(CATALOG.read_text(encoding="utf-8"))
    if args.stats:
        print_stats(data)
    errors = validate(data)
    if errors:
        print(f"FAILED - {len(errors)} problem(s):")
        for e in errors:
            print(f"  - {e}")
        return 1
    if args.check or not args.stats:
        print(f"OK - {len(data['titles'])} titles, {len(data['notifications'])} notifications, {len(data['subtitles'])} subtitle lines")
    return 0


if __name__ == "__main__":
    sys.exit(main())
