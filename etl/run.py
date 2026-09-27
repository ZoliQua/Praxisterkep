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
from pipeline import Step, run_steps
from validate import (
    previous_month_count,
    validate_records,
    validate_snapshot,
    validate_statement_month,
)

ROOT = Path(__file__).resolve().parent.parent
RAW_DIR = ROOT / "data" / "raw"


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
    parser.add_argument(
        "--rebuild-roads", action="store_true",
        help="rebuild the OSM road graph even if one is already present",
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

    # Everything below is a supplement or an analysis: it may fail without
    # stopping the release, but it may not fail quietly. Steps declare what
    # they need, the runner skips those whose input did not rebuild, and the
    # outcome lands in data/pipeline.json for the workflow to check.
    print("[+] supplements and analyses")
    eeszt_date = None

    def write(module, result) -> str:
        module.OUT.write_text(
            json.dumps(result, ensure_ascii=False, separators=(",", ":")) + "\n",
            encoding="utf-8")
        return module.OUT.name

    def step_eeszt() -> str:
        nonlocal eeszt_date
        import build_eeszt
        import fetch_eeszt
        for name, entity in fetch_eeszt.ENTITIES.items():
            fetch_eeszt.download(name, entity, size=500, sleep=1.0)
        eeszt_date = build_eeszt.latest_date()
        out = build_eeszt.build(eeszt_date)
        build_eeszt.OUT.write_text(
            json.dumps(out, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        return f"{build_eeszt.OUT.name}, registers of {eeszt_date}"

    def simple(module_name, describe=None, args=()):
        """A step that builds from its own inputs and writes its own file."""
        def run() -> str:
            module = __import__(module_name)
            result = module.build(*args() if callable(args) else args)
            if module_name == "centroids":
                result.pop("missing", None)
            name = write(module, result)
            return f"{name}{describe(result) if describe else ''}"
        return run

    def roads_step() -> str:
        import numpy as np
        import roads
        if roads.OUT.exists() and not args.rebuild_roads:
            return f"{roads.OUT.name} already built"
        graph = roads.build(roads.fetch())
        roads.OUT.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(roads.OUT, **graph)
        return f"{roads.OUT.name} from {graph['source'][0]}"

    def transit_step() -> str:
        import transit
        result = transit.build(transit.fetch())
        return f"{write(transit, result)}, feed {result['feedVersion']}"

    steps = [
        Step("eeszt", "EESZT master registers", step_eeszt,
             output=ROOT / "data" / "eeszt.json"),
        Step("dental_extra", "dental services outside the districts",
             simple("build_dental_extra", args=lambda: (month, eeszt_date)),
             needs=("eeszt",), output=ROOT / "data" / "dental_extra.json"),
        Step("crosscheck", "cross-check of the unpaired records",
             simple("crosscheck", args=lambda: (eeszt_date,)),
             needs=("eeszt",), output=ROOT / "data" / "crosscheck.json"),
        Step("providers", "provider register",
             simple("providers", args=lambda: (eeszt_date,),
                    describe=lambda r: f", {r['stats']['providers']} providers"),
             needs=("eeszt",), output=ROOT / "data" / "providers.json"),
        Step("gyse", "medical-aid retailers",
             simple("gyse", describe=lambda r: f", {r['stats']['premises']} premises"),
             needs=("eeszt",), output=ROOT / "data" / "gyse.json"),
        Step("operating", "operating level",
             simple("operating", args=lambda: (eeszt_date,),
                    describe=lambda r: f", {r['stats']['noLicence']} without a licence"),
             needs=("eeszt", "crosscheck", "providers"),
             output=ROOT / "data" / "operating.json"),
        Step("officialmap", "NEAK's own provider link",
             simple("officialmap",
                    describe=lambda r: f", {r['stats']['differ']} differences"),
             needs=("operating",), output=ROOT / "data" / "officialmap.json"),
        Step("specialist", "specialist institutions",
             simple("specialist", args=lambda: (month,)),
             output=ROOT / "data" / "specialist.json"),
        Step("vedono", "health-visitor branch",
             simple("vedono", describe=lambda r: f", {r['stats']['services']} services"),
             needs=("eeszt",), output=ROOT / "data" / "vedono.json"),
        Step("access", "distance to the nearest surgery", simple("access"),
             output=ROOT / "data" / "access.json"),
        Step("risk", "vacancy risk", simple("risk"),
             output=ROOT / "data" / "risk.json"),
        Step("ksh_age", "age composition", simple("ksh_age"),
             output=ROOT / "data" / "age.json"),
        Step("centroids", "settlement coordinates", simple("centroids"),
             output=ROOT / "data" / "geo" / "settlements.geojson"),
        Step("emergency", "on-call and emergency points", simple("emergency"),
             needs=("eeszt", "centroids"), output=ROOT / "data" / "emergency.json"),
        Step("roads", "road graph", roads_step,
             output=ROOT / "data" / "geo" / "road_graph.npz"),
        Step("traveltime", "driving times", simple("traveltime"),
             needs=("roads", "centroids", "emergency", "specialist", "gyse"),
             output=ROOT / "data" / "traveltime.json"),
        Step("survival", "survival analysis", simple("survival"),
             output=ROOT / "data" / "survival.json"),
        Step("workforce", "physician turnover", simple("workforce"),
             output=ROOT / "data" / "workforce.json"),
        Step("coverage", "settlement coverage", simple("coverage"),
             needs=("ksh_age",), output=ROOT / "data" / "coverage.json"),
        Step("transit", "public-transport reach", transit_step,
             needs=("traveltime",), output=ROOT / "data" / "transit.json"),
        Step("composite", "composite index", simple("composite"),
             needs=("coverage", "traveltime", "transit", "risk", "ksh_age",
                    "specialist"),
             output=ROOT / "data" / "composite.json"),
        Step("clusters", "care deserts", simple("clusters"),
             needs=("composite",), output=ROOT / "data" / "clusters.json"),
        # the analyses turned inside out: one record per settlement, which
        # the build then bakes into a static page for each of them
        Step("settlements", "settlement profiles", simple("settlements"),
             needs=("coverage", "composite", "traveltime", "transit", "ksh_age",
                    "clusters", "gyse", "vedono"),
             output=ROOT / "data" / "settlements.json"),
    ]
    run_steps(steps, month)
    print("done")


if __name__ == "__main__":
    main()
