#!/usr/bin/env python3
"""Mac-only, synthetic runtime experiment. Never a live-worker admission check.

Runs the installed OpenClaw against a fake loopback model under sandbox-exec.
No inherited environment, personal config, real provider key or buyer data.
Prints observations only; removes its own temporary files on completion.
"""
import hashlib
import http.server
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import tempfile
import threading
import time

MARKER = "SYNTHETIC_BUYER_PROBE_20261030"
BOOTSTRAP_MARKER = "SYNTHETIC_WORKSPACE_CONTEXT_MUST_NOT_REACH_MODEL"
LAUNCHERS = ["openclaw.mjs", "node-runtime-recovery.mjs", "node-compile-cache.mjs",
             "node-host-launcher.mjs", "node-version.mjs", "cli-root-options.mjs",
             "gateway-run-argv.mjs", "gateway-shutdown-budget.mjs", "node-sqlite.mjs", "package.json"]


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def literal(path):
    return json.dumps(str(path))


def config(root, port):
    return {
        "env": {"shellEnv": {"enabled": False}},
        "agents": {"defaults": {
            "workspace": str(root / "workspace"), "skipBootstrap": True,
            "contextInjection": "never", "skills": [], "startupContext": {"enabled": False},
            "model": "reseller-probe/synthetic",
            "compaction": {"enabled": False, "memoryFlush": {"enabled": False}},
        }, "entries": {"main": {"skills": []}}},
        "tools": {"profile": "minimal", "deny": ["*"]},
        "plugins": {"enabled": False}, "channels": {}, "cron": {"enabled": False},
        "hooks": {"internal": {"enabled": False}},
        "models": {"mode": "replace", "providers": {"reseller-probe": {
            "baseUrl": f"http://127.0.0.1:{port}/v1", "api": "openai-completions",
            "apiKey": "synthetic-probe-key", "agentRuntime": {"id": "openclaw"},
            "timeoutSeconds": 5, "models": [{
                "id": "synthetic", "name": "Synthetic local test", "reasoning": False,
                "input": ["text"], "cost": {"input": 0, "output": 0, "cacheRead": 0, "cacheWrite": 0},
                "contextWindow": 32000, "maxTokens": 1800,
            }],
        }}},
    }


def policy(root, runtime, port, blocked_file):
    # The installation may be a symlink into a source checkout under the user's
    # home. Only public runtime modules get read exceptions, never its .env/.git.
    lines = ["(version 1)", "(allow default)", "(deny network*)",
             f"(deny file-read* file-write* (subpath {literal(Path.home())}))",
             '(deny file-write* (subpath "/"))',
             f'(allow file-write* (subpath {literal(root)}) (literal "/dev/null"))',
             f"(allow file-read-metadata (literal {literal(Path.home())}) (subpath {literal(runtime)}))"]
    for directory in ["dist", "node_modules", "packages"]:
        lines.append(f"(allow file-read* (subpath {literal(runtime / directory)}))")
    for filename in LAUNCHERS:
        lines.append(f"(allow file-read* (literal {literal(runtime / filename)}))")
    # A synthetic file proves the read restriction even when the repo is outside
    # the home directory. This last deny cannot be relaxed by the code exceptions.
    lines.append(f"(deny file-read* (literal {literal(blocked_file)}))")
    lines.append(f'(allow network-outbound (remote ip "localhost:{port}"))')
    return "\n".join(lines) + "\n"


def run_case(root, runtime, node, mode, blocked_file):
    for name in ["state", "workspace", "tmp"]:
        (root / name).mkdir(parents=True)
    (root / "workspace" / "AGENTS.md").write_text(BOOTSTRAP_MARKER)
    requests = []
    unexpected = []
    tool_file = root / "TOOL_EXECUTED"
    reply = json.dumps({"body": "The saved price is PHP 500. Please review before sending.",
                        "reviewReason": "Synthetic isolation experiment only."})

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def do_GET(self):
            if self.path != "/probe":
                unexpected.append(self.path)
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"synthetic-loopback-control")

        def do_POST(self):
            try:
                size = int(self.headers.get("Content-Length", "0"))
                if not 0 < size <= 262144:
                    self.send_error(413)
                    return
                body = json.loads(self.rfile.read(size))
                requests.append({"path": self.path, "body": body})
                if self.path != "/v1/chat/completions":
                    unexpected.append(self.path)
                    self.send_error(404)
                    return
                if len(requests) > 3:
                    self.send_error(429)
                    return
                if mode == "timeout":
                    time.sleep(8)
                chunks = [({"role": "assistant", "content": reply}, None), ({}, "stop")]
                if mode == "tool" and len(requests) == 1:
                    chunks = [({"role": "assistant", "tool_calls": [{
                        "index": 0, "id": "call_synthetic", "type": "function",
                        "function": {"name": "exec", "arguments": json.dumps({"command": "touch " + str(tool_file)})},
                    }]}, None), ({}, "tool_calls")]
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.end_headers()
                for delta, finish in chunks:
                    chunk = {"id": "synthetic", "object": "chat.completion.chunk",
                             "created": int(time.time()), "model": "synthetic",
                             "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                    self.wfile.write(("data: " + json.dumps(chunk) + "\n\n").encode())
                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except (BrokenPipeError, ConnectionResetError):
                pass  # Expected when the synthetic timeout cancels the socket.

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    blocked_server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    blocked_thread = threading.Thread(target=blocked_server.serve_forever, daemon=True)
    blocked_thread.start()
    try:
        port = server.server_address[1]
        (root / "openclaw.json").write_text(json.dumps(config(root, port)))
        (root / "isolation.sb").write_text(policy(root, runtime, port, blocked_file))
        env = {"PATH": "/opt/homebrew/bin:/usr/bin:/bin", "TMPDIR": str(root / "tmp"),
               "OPENCLAW_STATE_DIR": str(root / "state"), "OPENCLAW_CONFIG_PATH": str(root / "openclaw.json"),
               "OPENCLAW_CONFIG_READONLY": "1", "NODE_DISABLE_COMPILE_CACHE": "1"}
        prefix = ["/usr/bin/sandbox-exec", "-f", str(root / "isolation.sb"), str(node)]

        def invoke(arguments, prompt=None):
            # A fresh process group bounds any child processes on outer timeout.
            process = subprocess.Popen(prefix + arguments, cwd=root / "workspace", env=env,
                                       stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                       stderr=subprocess.PIPE, text=True, start_new_session=True)
            try:
                stdout, stderr = process.communicate(prompt, timeout=35)
            except subprocess.TimeoutExpired:
                import signal
                os.killpg(process.pid, signal.SIGKILL)
                process.communicate()
                raise RuntimeError("Probe process exceeded its outer deadline; no runtime admission.")
            if len(stdout.encode()) + len(stderr.encode()) > 1048576:
                raise RuntimeError("Unexpected probe output size; no runtime admission.")
            return process.returncode, stdout, stderr

        read_code = "try {require('fs').readFileSync(" + literal(blocked_file) + ");process.exit(1)} catch(e) {process.exit(e.code==='EPERM'?0:2)}"
        require(invoke(['-e', read_code])[0] == 0, 'File read guard was not established')
        positive = f"fetch('http://127.0.0.1:{port}/probe').then(r=>r.text()).then(t=>process.exit(t==='synthetic-loopback-control'?0:1)).catch(()=>process.exit(2))"
        require(invoke(['-e', positive])[0] == 0, 'Allowed loopback control failed')
        negative = f"fetch('http://127.0.0.1:{blocked_server.server_address[1]}/probe').then(()=>process.exit(1)).catch(e=>process.exit(e.cause?.code==='EPERM'?0:2))"
        require(invoke(['-e', negative])[0] == 0, 'Other-port network guard was not established')
        code, stdout, _stderr = invoke([str(runtime / "openclaw.mjs"), "config", "validate", "--json"])
        require(code == 0 and json.loads(stdout).get('valid') is True, 'Installed runtime rejected config')
        code, stdout, stderr = invoke([
            str(runtime / "openclaw.mjs"), "agent", "exec", "--config", str(root / "openclaw.json"),
            "--cwd", str(root / "workspace"), "--message-file", "-", "--json",
            "--timeout", "3" if mode == "timeout" else "15", "--thinking", "off", "--model", "reseller-probe/synthetic",
        ], MARKER + ". Draft only from saved price PHP 500. Return JSON body and reviewReason. No tools or sending.")
        envelope = json.loads(stdout)
        retained = []
        for directory in [root / "state", root / "tmp"]:
            for path in directory.rglob("*"):
                if path.is_file() and MARKER.encode() in path.read_bytes():
                    retained.append(str(path.relative_to(root)))
        observed = {
            "mode": mode, "exit_code": code, "status": envelope.get("status"),
            "model_requests": len(requests),
            "offered_tools": [len(r["body"].get("tools") or []) for r in requests],
            "output_caps": [r["body"].get("max_completion_tokens", r["body"].get("max_tokens")) for r in requests],
            "store_fields": [r["body"].get("store") for r in requests],
            "request_bytes": [len(json.dumps(r["body"]).encode()) for r in requests],
            "tool_executed": tool_file.exists(), "tool_summary": envelope.get("toolSummary"),
            "workspace_context_leaked": any(BOOTSTRAP_MARKER in json.dumps(r) for r in requests),
            "retained_prompt_files": retained,
            "temporary_run_dirs_remaining": len(list((root / "tmp").glob("openclaw-agent-exec-*"))),
            "file_read_guard": True, "other_port_network_guard": True,
            "cleanup_diagnostic_warning": "reclamation Worker failed" in stderr,
        }
        require(not unexpected and requests, 'Expected only the synthetic model endpoint')
        require(not observed['tool_executed'] and (not observed['workspace_context_leaked']), 'Isolation violation')
        require(not any(observed['offered_tools']), 'Unexpected model tool surface')
        require(not retained and observed['temporary_run_dirs_remaining'] == 0, 'Runtime state cleanup incomplete')
        if mode == "success":
            require(code == 0 and len(requests) == 1 and (json.loads(envelope['final']) == json.loads(reply)), 'Synthetic completion failed')
        if mode == "timeout":
            require(code == 2 and envelope.get('status') == 'timeout', 'Expected explicit timeout')
        return observed
    finally:
        server.shutdown()
        server.server_close()
        blocked_server.shutdown()
        blocked_server.server_close()


def main():
    if platform.system() != "Darwin" or not Path("/usr/bin/sandbox-exec").is_file():
        raise SystemExit("This experiment requires macOS sandbox-exec; it never falls back to an unsandboxed run.")
    executable = shutil.which("openclaw")
    node = Path("/opt/homebrew/bin/node")
    if not executable or not node.is_file():
        raise SystemExit("Install paths unavailable; no runtime was started.")
    runtime = Path(executable).resolve().parent
    package = json.loads((runtime / "package.json").read_text())
    with tempfile.TemporaryDirectory(prefix="reseller-runtime-probe-", dir="/private/tmp") as scratch:
        root = Path(scratch)
        blocked_file = root / "synthetic-denied-file"
        blocked_file.write_text("synthetic forbidden read")
        observations = [run_case(root / mode, runtime, node, mode, blocked_file) for mode in ["success", "tool", "timeout"]]
    report = {
        "purpose": "synthetic experiment, not live worker admission",
        "openclaw_version": package["version"], "platform": platform.system(),
        "launcher_sha256": hashlib.sha256((runtime / "openclaw.mjs").read_bytes()).hexdigest(),
        "observations": observations,
        "requires_one_request_gate": any(o["model_requests"] > 1 for o in observations),
        "live_worker_admitted": False,
    }
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
