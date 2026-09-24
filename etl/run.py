"""Pipeline entrypoint: fetch -> parse -> geocode -> validate -> build.

Usage: python etl/run.py --month 2026-08 [--kind dental|gp|all] [--skip-geocode]
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import parse_dental
import parse_gp
import parse_okfo
import parse_registry
from build import attach_geocodes, build_history, build_snapshot, write_outputs
from fetch_neak import fetch_month
from geocode import geocode_site, load_cache
from validate import (
    previous_month_count,
    validate_records,
    validate_snapshot,
    validate_statement_month,
)

RAW_DIR = Path(__file__).resolve().parent.parent / "data" / "raw"


def _parse_kind(kind: str, raw: Path, month: str) -> tuple[list, list, list]:
    """Returns (vacant, dissolved, registry) for one kind."""
    if kind == "dental":
        for pdf in ("dental_vacant.pdf", "dental_vacant_dissolved.pdf"):
            validate_statement_month(
                parse_dental.extract_statement_month(raw / pdf), month
            )
        return (
            parse_dental.parse_vacant(raw / "dental_vacant.pdf"),
            parse_dental.parse_dissolved(raw / "dental_vacant_dissolved.pdf"),
            parse_registry.parse(raw / "dental_registry.xls"),
        )
    validate_statement_month(
        parse_dental.extract_statement_month(raw / "gp_vacant.pdf"), month
    )
    # NEAK publishes no dissolved (megszűnt) list for GP services
    return (
        parse_gp.parse_vacant(raw / "gp_vacant.pdf"),
        [],
        parse_gp.parse_registry(raw / "gp_registry.xls"),
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--month", default=date.today().strftime("%Y-%m"))
    parser.add_argument("--kind", choices=("dental", "gp", "all"), default="all")
    parser.add_argument(
        "--skip-geocode", action="store_true",
        help="use only cached coordinates (no Nominatim requests)",
    )
    args = parser.parse_args()
    month = args.month
    kinds = ("dental", "gp") if args.kind == "all" else (args.kind,)

    print(f"[1/5] fetch {month}")
    fetch_month(month, only_kind=None)
    raw = RAW_DIR / month

    snapshots: dict[str, dict] = {}
    cache = load_cache()
    for kind in kinds:
        print(f"[2/5] parse {kind}")
        vacant, dissolved, registry = _parse_kind(kind, raw, month)
        print(f"      vacant={len(vacant)} dissolved={len(dissolved)} "
              f"registry={len(registry)}")

        print(f"[3/5] geocode {kind}")
        if not args.skip_geocode:
            for r in vacant + dissolved:
                for s in r["sites"]:
                    geocode_site(s["postalCode"], s["settlement"], s["address"], cache)
        attach_geocodes(vacant + dissolved, cache)

        # OKFŐ long-term flags (supplementary: a failure must not block the
        # NEAK pipeline — it is reported and the month builds without flags)
        long_term_as_of = None
        try:
            okfo_path = parse_okfo.fetch(month, kind)
            as_of, rows = parse_okfo.parse(okfo_path, kind)
            drift = abs((int(month[:4]) * 12 + int(month[5:7]))
                        - (int(as_of[:4]) * 12 + int(as_of[5:7])))
            if drift > 2:
                print(f"      WARNING: OKFŐ list as-of {as_of} too far from "
                      f"{month}; skipping long-term flags")
            else:
                matched, unmatched = parse_okfo.apply_longterm(vacant + dissolved, rows)
                long_term_as_of = as_of
                print(f"      okfő: {len(rows)} rows, {matched} matched"
                      + (f", {unmatched} UNMATCHED" if unmatched else ""))
        except Exception as exc:
            print(f"      WARNING: OKFŐ long-term list unavailable: {exc}")

        print(f"[4/5] validate {kind}")
        validate_records(vacant + dissolved, previous_month_count(month, kind),
                         vacant_count=len(vacant))
        snapshot = build_snapshot(month, kind, vacant, dissolved, registry,
                                  long_term_as_of=long_term_as_of)
        validate_snapshot(snapshot)
        snapshots[kind] = snapshot

    print("[5/5] build")
    for path in write_outputs(snapshots, month):
        print(f"      wrote {path}")
    print(f"      wrote {build_history()}")

    # EESZT supplement (source H) — optional: a failed download or guard
    # keeps the previous data/eeszt.json and never blocks the NEAK release
    print("[+] EESZT supplement")
    try:
        import build_eeszt
        import fetch_eeszt
        for name, entity in fetch_eeszt.ENTITIES.items():
            fetch_eeszt.download(name, entity, size=500, sleep=1.0)
        out = build_eeszt.build(build_eeszt.latest_date())
        build_eeszt.OUT.write_text(
            json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"      wrote {build_eeszt.OUT}")

        # the dental services outside the district map (on-call, university,
        # every Szakellátás service), joined to the same EESZT registers
        import build_dental_extra
        extra = build_dental_extra.build(month, build_eeszt.latest_date())
        build_dental_extra.OUT.write_text(
            json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        counts = " ".join(f"{g}={st['services']}" for g, st in extra["stats"].items())
        print(f"      wrote {build_dental_extra.OUT} ({counts})")

        # cross-check: what the addresses and provider names say about the
        # records the code chain could not pair
        import crosscheck
        xcheck = crosscheck.build(build_eeszt.latest_date())
        crosscheck.OUT.write_text(
            json.dumps(xcheck, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {crosscheck.OUT} ({len(xcheck['records'])} records, "
              f"{len(xcheck['eesztOnly'])} EESZT-only)")

        # one row per contracted provider, with its official name and seat
        import providers
        prov_out = providers.build(build_eeszt.latest_date())
        providers.OUT.write_text(
            json.dumps(prov_out, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {providers.OUT} ({prov_out['stats']['providers']} providers, "
              f"{prov_out['stats']['identified']} identified)")

        # the medical-aid retailers: another EESZT register, same shape
        import gyse
        gy = gyse.build()
        gyse.OUT.write_text(
            json.dumps(gy, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {gyse.OUT} ({gy['stats']['premises']} premises)")

        # operating level: which licence each praxis actually works under
        import operating
        op_out = operating.build(build_eeszt.latest_date())
        operating.OUT.write_text(
            json.dumps(op_out, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {operating.OUT} ({op_out['stats']['praxes']} praxes, "
              f"{op_out['stats']['noLicence']} without a licence)")
        # NEAK's own FIN -> provider link, held against ours (never replacing it)
        import officialmap
        om = officialmap.build()
        officialmap.OUT.write_text(
            json.dumps(om, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {officialmap.OUT} "
              f"({om['stats']['agreement']:.1%} agreement, "
              f"{om['stats']['differ']} differences)")
    except Exception as exc:  # noqa: BLE001 — supplement must not block release
        print(f"      WARNING: EESZT supplement skipped: {exc}")

    # specialist care (source I): the contracted inpatient and outpatient
    # institutions — context around the districts, never part of them
    try:
        import specialist
        sp = specialist.build(month)
        specialist.OUT.write_text(
            json.dumps(sp, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {specialist.OUT} ("
              + ", ".join(f"{c}: {st['rows']}" for c, st in sp["stats"].items()) + ")")
    except Exception as exc:  # noqa: BLE001 — supplement must not block release
        print(f"      WARNING: specialist list skipped: {exc}")

    # health visitors: the third branch, EESZT-only (no NEAK vacancy list)
    try:
        import vedono
        vd = vedono.build()
        vedono.OUT.write_text(
            json.dumps(vd, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {vedono.OUT} ({vd['stats']['services']} services)")
    except Exception as exc:  # noqa: BLE001 — supplement must not block release
        print(f"      WARNING: health-visitor supplement skipped: {exc}")

    # accessibility: how far the nearest operating surgery is (needs only the
    # NEAK snapshot, so it runs even when the EESZT step failed)
    try:
        import access
        acc = access.build()
        access.OUT.write_text(
            json.dumps(acc, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {access.OUT} ({len(acc['districts'])} districts)")
    except Exception as exc:  # noqa: BLE001 — supplement must not block release
        print(f"      WARNING: accessibility analysis skipped: {exc}")

    # vacancy risk: learned from the archived monthly snapshots, so it needs
    # the whole data/ history rather than this month alone
    try:
        import risk
        rk = risk.build()
        risk.OUT.write_text(
            json.dumps(rk, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        print(f"      wrote {risk.OUT} ("
              + ", ".join(f"{k}: {len(v['rows'])}" for k, v in rk["kinds"].items()) + ")")
    except Exception as exc:  # noqa: BLE001 — supplement must not block release
        print(f"      WARNING: risk model skipped: {exc}")
    # the road graph is expensive (a 310 MB download and a few minutes of
    # parsing) and changes slowly, so it is built only when it is missing
    try:
        import roads
        if roads.OUT.exists():
            print(f"      road graph present: {roads.OUT.name}")
        else:
            graph = roads.build(roads.fetch())
            roads.OUT.parent.mkdir(parents=True, exist_ok=True)
            import numpy as np
            np.savez_compressed(roads.OUT, **graph)
            print(f"      wrote {roads.OUT}")
    except Exception as exc:  # noqa: BLE001 — routing must not block release
        print(f"      WARNING: road graph skipped: {exc}")

    # the analyses that read several outputs at once, in dependency order
    for name, label in (("ksh_age", "age composition"),
                        ("centroids", "settlement coordinates"),
                        ("emergency", "on-call and emergency points"),
                        ("traveltime", "driving times"),
                        ("survival", "survival analysis"),
                        ("workforce", "physician turnover"),
                        ("coverage", "settlement coverage"),
                        ("transit", "public-transport reach"),
                        ("composite", "composite index"),
                        ("clusters", "care deserts")):
        try:
            module = __import__(name)
            # the transit feed is a 100 MB download, fetched on demand
            result = (module.build(module.fetch()) if name == "transit"
                      else module.build())
            if name == "centroids":
                result.pop("missing", None)
            module.OUT.write_text(
                json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
                encoding="utf-8")
            print(f"      wrote {module.OUT}")
        except Exception as exc:  # noqa: BLE001 — analyses must not block release
            print(f"      WARNING: {label} skipped: {exc}")
    print("done")


if __name__ == "__main__":
    main()
