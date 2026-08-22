"""Download source files and archive them under data/raw/YYYY-MM/.

Raw archives are the audit trail: never overwrite an existing month.
"""
from __future__ import annotations

import sys
from datetime import date
from pathlib import Path

import requests

from sources import SOURCES

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def fetch_month(month: str, only_kind: str | None = "dental") -> list[Path]:
    """Fetch all sources for a month (YYYY-MM). Returns saved paths."""
    out_dir = RAW_DIR / month
    out_dir.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for name, src in SOURCES.items():
        if only_kind and src.get("kind") != only_kind:
            continue
        target = out_dir / f"{name}.{src['format']}"
        if target.exists():
            print(f"skip (exists): {target}")
            saved.append(target)
            continue
        resp = requests.get(src["url"], timeout=60)
        resp.raise_for_status()
        target.write_bytes(resp.content)
        print(f"saved: {target} ({len(resp.content)} bytes)")
        saved.append(target)
    return saved


if __name__ == "__main__":
    month = sys.argv[1] if len(sys.argv) > 1 else date.today().strftime("%Y-%m")
    fetch_month(month)
