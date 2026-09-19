"""Fetch the public EESZT master-data (törzspublikáció) entities (source H).

Usage:
  python etl/fetch_eeszt.py [--size 500] [--sleep 1.0]

The portal at eeszt.gov.hu/hu/torzspublikacio is a viewer over a REST
endpoint (discovered from the page's own XHR):

  GET /torzspublikacio-portlet/rest/torzsvizualizacio/getEntity
      ?entityId=<id>&page=<0-based>&size=<n>

Three entities are downloaded in full and archived as JSONL under
data/raw/eeszt/<name>_<YYYY-MM-DD>.jsonl.gz (one row per line, with the
field list in a sidecar .meta.json):

  NEAK_FINSZOLG            — financed services: FIN code -> provider,
                             institution code, official district name
  EUSZOLG_PUBLIKUS         — healthcare providers: id, name, tax number, seat
  EUSZOLG_ENGEDELY_PUBLIKUS — operating licences: provider id, premises
                             address, profession code/name, financing flag

Every page is validated: row count must match, duplicate first-column ids
fail loudly, and the run aborts if totalRowCount changes mid-download.
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import json
import sys
import time
from pathlib import Path

import requests

BASE = ("https://www.eeszt.gov.hu/torzspublikacio-portlet/rest/"
        "torzsvizualizacio/getEntity")
ENTITIES = {
    "neak_finszolg": "NEAK_FINSZOLG.NEAK_FINSZOLG.K",
    "euszolg": "EUSZOLG_PUBLIKUS.EUSZOLG_PUBLIKUS.M",
    "euszolg_engedely": "EUSZOLG_ENGEDELY_PUBLIKUS.EUSZOLG_ENGEDELY_PUBLIKUS.M",
}
HEADERS = {"User-Agent": ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/128.0 Safari/537.36")}
RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw" / "eeszt"


def fetch_page(entity_id: str, page: int, size: int) -> dict:
    last: Exception | None = None
    for attempt in range(4):
        try:
            resp = requests.get(BASE, params={
                "entityId": entity_id, "page": page, "size": size,
            }, headers=HEADERS, timeout=120)
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001 — transient portal errors
            last = exc
            time.sleep(20 * (attempt + 1))
    raise RuntimeError(f"{entity_id} page {page} failed after retries: {last}")


def download(name: str, entity_id: str, size: int, sleep: float) -> Path:
    today = dt.date.today().isoformat()
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    out = RAW_DIR / f"{name}_{today}.jsonl.gz"
    meta_file = RAW_DIR / f"{name}_{today}.meta.json"
    if out.exists():
        print(f"[{name}] already downloaded today — keeping {out.name}")
        return out

    first = fetch_page(entity_id, 0, size)
    fields = [f["fieldId"] for f in first["fieldNames"]]
    total = first["totalRowCount"]
    pages = (total + size - 1) // size
    print(f"[{name}] {total} rows, {pages} pages of {size}")

    seen: set[str] = set()
    rows_written = 0
    with gzip.open(out, "wt", encoding="utf-8") as fh:
        page = 0
        data = first
        while True:
            rows = data["entityRows"]
            if data["totalRowCount"] != total:
                raise RuntimeError(
                    f"{name}: totalRowCount changed mid-download "
                    f"({total} -> {data['totalRowCount']}) — rerun")
            for r in rows:
                key = r["fields"][0]
                if key in seen:
                    raise RuntimeError(f"{name}: duplicate first column {key!r}")
                seen.add(key)
                fh.write(json.dumps(r["fields"], ensure_ascii=False) + "\n")
                rows_written += 1
            page += 1
            if page >= pages:
                break
            if page % 20 == 0:
                print(f"[{name}] page {page}/{pages} ({rows_written} rows)")
            time.sleep(sleep)
            data = fetch_page(entity_id, page, size)

    if rows_written != total:
        out.unlink()
        raise RuntimeError(f"{name}: wrote {rows_written} rows, expected {total}")
    meta_file.write_text(json.dumps({
        "entityId": entity_id, "date": today, "fields": fields,
        "totalRowCount": total,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[{name}] OK — {rows_written} rows -> {out.name}")
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--size", type=int, default=500)
    parser.add_argument("--sleep", type=float, default=1.0)
    parser.add_argument("--only", choices=list(ENTITIES), default=None)
    args = parser.parse_args()
    failures = []
    for name, entity_id in ENTITIES.items():
        if args.only and name != args.only:
            continue
        try:
            download(name, entity_id, args.size, args.sleep)
        except Exception as exc:  # noqa: BLE001 — report at the end
            print(f"[{name}] FAILED: {exc}")
            failures.append(name)
    if failures:
        sys.exit(f"failed entities: {', '.join(failures)}")


if __name__ == "__main__":
    main()
