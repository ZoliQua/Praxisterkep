"""Pipeline entrypoint: fetch -> parse -> geocode -> validate -> build.

Usage: python etl/run.py --month 2026-08
MVP scope: dental only (see CLAUDE.md).
"""
from __future__ import annotations

import argparse
from datetime import date


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=date.today().strftime("%Y-%m"))
    args = parser.parse_args()
    # TODO: wire together fetch_neak, parse_dental, geocode, validate, build
    raise SystemExit(f"pipeline not implemented yet (month={args.month})")


if __name__ == "__main__":
    main()
