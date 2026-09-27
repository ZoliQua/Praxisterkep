"""Running the monthly steps so that a failure is visible, not silent.

The pipeline grew from three steps to twenty, and each new one arrived
wrapped in its own try/except with a printed warning — because a supplement
must never block the NEAK release. That rule is right; the way it was
implemented was not. Two things went wrong with it:

  * A step that failed left its previous output in place, and the monthly
    job committed that file again with a fresh commit message. Half the
    published data could be a month old and nothing said so.
  * A step that failed did not stop the steps built on top of it, so the
    composite index would happily recompute from last month's driving times.

So steps are declared here with their dependencies, and the runner:

  * skips a step whose dependency failed, instead of feeding it stale input,
  * records what happened in data/pipeline.json next to the data itself,
  * and exits non-zero from --check, which is what turns a silent warning
    into an opened issue in the monthly workflow.

The core NEAK steps stay where they are, in run.py: those still abort the
run, because without them there is no release at all.

Usage:
  python etl/pipeline.py --check     # exit 1 if the last run had a failure
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import sys
import traceback
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATUS = ROOT / "data" / "pipeline.json"
SCHEMA_VERSION = 1

OK, FAILED, SKIPPED = "ok", "failed", "skipped"


@dataclass
class Step:
    """One optional step: what it is, what it needs, and what it does."""

    name: str
    label: str
    run: Callable[[], str]
    needs: tuple[str, ...] = ()
    output: Path | None = None
    result: dict = field(default_factory=dict)


def run_steps(steps: list[Step], month: str) -> dict:
    """Run every step whose dependencies held, and write the status file."""
    status: dict[str, str] = {}
    records: list[dict] = []

    for step in steps:
        blocked = [n for n in step.needs if status.get(n) != OK]
        if blocked:
            status[step.name] = SKIPPED
            note = f"needs {', '.join(blocked)}"
            print(f"      SKIPPED {step.label}: {note}")
            records.append(record(step, SKIPPED, note))
            continue
        try:
            summary = step.run() or ""
            status[step.name] = OK
            print(f"      {step.label}: {summary}" if summary else f"      {step.label}: ok")
            records.append(record(step, OK, summary))
        except Exception as exc:  # noqa: BLE001 — a supplement must not abort the run
            status[step.name] = FAILED
            print(f"      FAILED {step.label}: {exc}")
            traceback.print_exc(limit=3)
            records.append(record(step, FAILED, f"{type(exc).__name__}: {exc}"))

    out = {
        "schemaVersion": SCHEMA_VERSION,
        "month": month,
        "finished": dt.datetime.now(dt.UTC).replace(microsecond=0).isoformat(),
        "steps": records,
        "failed": [r["name"] for r in records if r["status"] != OK],
    }
    STATUS.write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n",
                      encoding="utf-8")
    trouble = out["failed"]
    print(f"      pipeline status -> {STATUS.name}: "
          + (f"{len(trouble)} step(s) need attention: {', '.join(trouble)}"
             if trouble else "every step ok"))
    return out


def record(step: Step, status: str, note: str) -> dict:
    """One row of the status file, with the age of the output it owns."""
    written = None
    if step.output and step.output.exists():
        written = dt.datetime.fromtimestamp(
            step.output.stat().st_mtime, dt.UTC).replace(microsecond=0).isoformat()
    return {
        "name": step.name,
        "label": step.label,
        "status": status,
        "note": note,
        "output": str(step.output.relative_to(ROOT)) if step.output else None,
        "outputWritten": written,
    }


def load() -> dict | None:
    if not STATUS.exists():
        return None
    return json.loads(STATUS.read_text(encoding="utf-8"))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true",
                        help="exit 1 if the last run left a step failed or skipped")
    args = parser.parse_args()
    state = load()
    if state is None:
        sys.exit(f"no pipeline status at {STATUS}")
    for row in state["steps"]:
        mark = {OK: "ok     ", FAILED: "FAILED ", SKIPPED: "skipped"}[row["status"]]
        print(f"{mark} {row['label']}: {row['note']}")
    if args.check and state["failed"]:
        sys.exit(f"\n{len(state['failed'])} step(s) did not run cleanly: "
                 f"{', '.join(state['failed'])}")


if __name__ == "__main__":
    main()
