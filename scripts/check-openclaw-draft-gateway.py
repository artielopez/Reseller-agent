#!/usr/bin/env python3
"""Synthetic integration helper; receives a loopback test capability on stdin.

Uses the isolation experiment policy, not a production worker launcher. It never
accepts a remote model URL or real API key and never admits a live worker.
"""
import json
from pathlib import Path
import re
import runpy
import shutil
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit

settings = json.load(sys.stdin)
url = urlsplit(settings["baseUrl"])
if (url.scheme != "http" or url.hostname != "127.0.0.1" or not url.port
        or url.path != "/v1" or url.query or url.fragment or url.username or url.password
        or not re.fullmatch(r"[a-f0-9]{64}", settings["token"])):
    raise SystemExit("Only a synthetic loopback capability is accepted")
helper = runpy.run_path(str(Path(__file__).with_name("probe-openclaw-isolation.py")))
executable = shutil.which("openclaw")
if not executable or not Path("/usr/bin/sandbox-exec").is_file():
    raise SystemExit("Required local isolated runtime unavailable")
runtime = Path(executable).resolve().parent
with tempfile.TemporaryDirectory(prefix="reseller-gateway-probe-", dir="/private/tmp") as scratch:
    root = Path(scratch)
    for name in ["state", "workspace", "tmp"]:
        (root / name).mkdir()
    (root / "workspace" / "AGENTS.md").write_text(helper["BOOTSTRAP_MARKER"])
    denied = root / "synthetic-denied-file"
    denied.write_text("synthetic forbidden read")
    config = helper["config"](root, url.port)
    config["agents"]["defaults"]["model"] = "reseller-probe/reseller-draft"
    provider = config["models"]["providers"]["reseller-probe"]
    provider["apiKey"] = settings["token"]
    provider["models"][0]["id"] = "reseller-draft"
    (root / "openclaw.json").write_text(json.dumps(config))
    (root / "isolation.sb").write_text(helper["policy"](root, runtime, url.port, denied))
    env = {"PATH": "/opt/homebrew/bin:/usr/bin:/bin", "TMPDIR": str(root / "tmp"),
           "OPENCLAW_STATE_DIR": str(root / "state"), "OPENCLAW_CONFIG_PATH": str(root / "openclaw.json"),
           "OPENCLAW_CONFIG_READONLY": "1", "NODE_DISABLE_COMPILE_CACHE": "1"}
    cmd = ["/usr/bin/sandbox-exec", "-f", str(root / "isolation.sb"), "/opt/homebrew/bin/node",
           str(runtime / "openclaw.mjs"), "agent", "exec", "--config", str(root / "openclaw.json"),
           "--cwd", str(root / "workspace"), "--message-file", "-", "--json", "--timeout", "12",
           "--thinking", "off", "--model", "reseller-probe/reseller-draft"]
    process = subprocess.Popen(cmd, cwd=root / "workspace", env=env, stdin=subprocess.PIPE,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, start_new_session=True)
    try:
        stdout, _stderr = process.communicate(helper["MARKER"] + ". Use the supplied draft model. No tools or sending.", timeout=25)
    except subprocess.TimeoutExpired:
        import os
        import signal
        os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise SystemExit("Synthetic integration exceeded its outer deadline")
    envelope = json.loads(stdout)
    retained = []
    for folder in [root / "state", root / "tmp"]:
        for path in folder.rglob("*"):
            if path.is_file() and helper["MARKER"].encode() in path.read_bytes():
                retained.append(str(path.relative_to(root)))
    print(json.dumps({"exitCode": process.returncode, "ok": envelope.get("ok"),
                      "status": envelope.get("status"), "final": envelope.get("final"),
                      "assistantTurns": envelope.get("assistantTurns"), "toolSummary": envelope.get("toolSummary"),
                      "retainedPromptFiles": retained,
                      "temporaryRunDirsRemaining": len(list((root / "tmp").glob("openclaw-agent-exec-*"))),
                      "liveWorkerAdmitted": False}))
