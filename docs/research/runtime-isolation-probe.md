# Mac runtime isolation experiment — 30 October 2026

## Outcome

OpenClaw can produce a synthetic draft in a dedicated process with no model tools, no injected workspace context and no retained prompt after graceful completion/timeout. **It is not yet admitted as a live draft worker.** An unsolicited tool call was rejected, but OpenClaw then made a second model request and returned success. A deny-all tool policy alone does not enforce the project's one-provider-attempt rule.

The next implementation needs a trusted, single-use model connection that forwards at most one inference request per admitted job, refuses redirects/retries and rejects tool-bearing output. Reject runtime results with any attempted tool calls, multiple assistant turns, cleanup failure or an uncertain outcome. The database's daily attempt reservation remains necessary but cannot alone count a runtime's internal model loop.

## Reproduce

On this Mac, with the installed OpenClaw and Homebrew Node:

```bash
python3 scripts/probe-openclaw-isolation.py
```

This is a synthetic experiment, not a setup command or a `verifyRuntime` implementation. It starts no gateway, daemon or channel. It uses only a fake local OpenAI-compatible model and fixed synthetic text/key; no real model inference or billing occurs. It fails rather than falling back to an unsandboxed run on unsupported systems.

The script creates/removes its own temporary directory. macOS `sandbox-exec` denies personal-home file access and all writes outside the experiment. Read-only exceptions cover the installed public launcher/runtime/dependency modules, because this installation is a symlink into a source checkout. It permits networking only to the fake model's loopback port. A synthetic denied-file check and positive/negative loopback tests verify the guards. No personal agent configuration, memory, browser sessions or credentials are copied. The script is diagnostic code; its output must never enable a production worker.

## Evidence

[Sanitized observations](openclaw-isolation-results-2026-10-30.json), recorded from OpenClaw **2026.9.6**, Node **24.21.0** on macOS. Launcher hash identifies the tested entry file only; it is not a hash of all installed code or proof about a later upgrade.

| Case | Result | Model requests | Attempted tool executed | Prompt files left in runtime state |
| --- | --- | --- | --- | --- |
| Normal synthetic answer | Exit 0, valid expected JSON | 1 | No | 0 |
| Unsolicited `exec` request from fake model | Tool rejected; runtime nevertheless returns success | **2** | No | 0 |
| Provider stalls past 3-second run budget | Exit 2, explicit timeout | 1 | No | 0 |

All cases offered zero tools, omitted the synthetic workspace `AGENTS.md` canary, capped each model response at 1,800 tokens, and removed the temporary run directory. The model request did **not** explicitly include `store:false`; no conclusion about a real provider's retention follows from this local test. The fake model's responses do not establish answer quality or resistance to misleading buyer text.

The runtime emitted SQLite reclamation/checkpoint diagnostics before its final clean-close receipt. Despite those diagnostics, no prompt marker or runtime directory remained in the inspected experiment state after the processes exited. Crash/SIGKILL cleanup, disk recovery, all possible log paths, multiple independent real database sessions and a long-running worker are **not** verified. The sandbox blocked writes outside the experiment; a future real wrapper must retain that restriction and handle startup cleanup of its own stale state.

## Configuration findings

- `agent exec` ordinarily inherits personal configuration and credentials. Its default coding profile is unsuitable for buyer text.
- A pinned config, dedicated state/temp/workspace, sanitized environment, explicit OpenClaw runtime and `tools.deny: ["*"]` worked under the OS sandbox.
- `plugins.enabled:false`, empty channels/skills, no bootstrap/context injection, disabled startup context and memory-flush/compaction were part of the tested config.
- `agents.defaults.memorySearch` is not accepted by this installed version; the validator rejected it before any agent run. The final config omits it, disables plugins/context and removes the model tool surface.
- `--auth-env-only` cannot be combined with `--config`; do not assume that flag can be added to the tested pinned-config path. The filesystem/environment restrictions provide the tested separation instead.
- Official CLI options do not expose the internal execution function's `maxToolCalls` dependency. Do not build the app around a hashed internal module import to work around this.

Installed primary sources: `docs/cli/agent.md`, `docs/cli/config.md`, `docs/gateway/config-tools/tool-policy.md`, `docs/gateway/config-tools/custom-providers.md`, `docs/gateway/config-agents/workspace-and-bootstrap.md`, and `docs/gateway/config-agents/runtime-and-cli-backends.md` under the installed OpenClaw package. Source inspection of `agent-exec-input` confirmed config layering; the experiment verifies the narrower behavior above.

Hermes source inspection found `--safe-mode` (config/plugins/MCP/context bypass), `--ignore-rules`, one-shot output and run-budget options. These are candidates only: no equivalent Hermes subprocess/retention experiment has run, and its general CLI/gateway remains disconnected.

## Execution ledger

Branch `codex/runtime-isolation-probe`, based on `efa78d0` (PR #10). Previous goal turn was progress: worker controls, tests and PR were delivered. PR #10's final head passed [GitHub Application checks](https://github.com/artielopez/Reseller-agent/actions/runs/41064028439), including the default build and both browser suites.

Ruling: perform a throwaway synthetic experiment before writing a live adapter. The observed extra request changes the implementation prerequisite: require a connection-level one-request gate, not just a tool-deny flag or a successful CLI exit. Cost if wrong: one daily quota reservation could allow multiple paid model calls.

Ruling: keep OpenClaw and Hermes disconnected from real buyer data until provider credentials/retention and a bounded wrapper are verified. Supabase project access remains pending, but does not block implementing the local request gate.

No application runtime, SQL, dependencies or deployed feature changed in this research stage. The script itself was executed across all three cases; app regression checks from PR #10 remain the relevant unchanged-application evidence.
