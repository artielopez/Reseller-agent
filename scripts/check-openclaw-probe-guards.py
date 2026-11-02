#!/usr/bin/env python3
"""Run from the repo root with python3 -O to catch skipped safety checks.

Requires the same local Mac runtime as probe-openclaw-isolation.py. This runs
only its synthetic cases and audits which guard subprocesses actually execute.
"""
import contextlib
import io
import json
import runpy
import sys

if sys.flags.optimize < 1:
    raise SystemExit("Run this regression with python3 -O.")

calls = []


def audit(event, args):
    if event == "subprocess.Popen" and "-e" in args[1]:
        calls.append(args[1])


sys.addaudithook(audit)
namespace = runpy.run_path("scripts/probe-openclaw-isolation.py")
output = io.StringIO()
with contextlib.redirect_stdout(output):
    namespace["main"]()
if len(calls) != 9:
    raise RuntimeError(f"Expected all nine guard subprocesses under optimized Python, observed {len(calls)}")
try:
    namespace["require"](False, "synthetic guard failure")
except RuntimeError as error:
    if str(error) != "synthetic guard failure":
        raise
else:
    raise RuntimeError("A failed check did not stop the probe")
report = json.loads(output.getvalue())
print(json.dumps({
    "optimized_guard_invocations": len(calls),
    "failed_check_raises": True,
    "cases": len(report["observations"]),
    "live_worker_admitted": report["live_worker_admitted"],
}))
