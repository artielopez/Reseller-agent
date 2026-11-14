// Operator-run synthetic acceptance only. No model or marketplace calls.
// The ephemeral input must be owner-only, ignored, and deleted after the run.
import { readFile, stat } from "node:fs/promises";
const env = await readFile(".env.cloud.local", "utf8");
const value = (key) =>
  env
    .match(new RegExp(`^${key}=(.*)$`, "m"))?.[1]
    ?.trim()
    .replace(/^['"]|['"]$/g, "");
const url = value("NEXT_PUBLIC_SUPABASE_URL");
const key = value("NEXT_PUBLIC_SUPABASE_ANON_KEY");
if (url !== "https://ecusonvqyjnuwjhvcivb.supabase.co" || !key)
  throw Error("Expected acceptance project unavailable");
let input;
if (process.argv[2] === "--probe") {
  input = { worker_token: "0".repeat(64), command: { op: "claim" } };
} else {
  const path = ".worker-state/hosted-concurrency.json";
  const info = await stat(path);
  if ((info.mode & 0o777) !== 0o600 || !info.isFile())
    throw Error("Private acceptance input required");
  input = JSON.parse(await readFile(path, "utf8"));
  if (
    !/^[a-f0-9]{64}$/.test(input.worker_token) ||
    !["claim", "start", "submit"].includes(input.command?.op)
  )
    throw Error("Invalid acceptance input");
}
if (process.argv[2] === "--delayed") {
  console.log(JSON.stringify({ ready: true, delayMs: 6000 }));
  await new Promise((resolve) => setTimeout(resolve, 6000));
}
try {
  const startedAt = new Date().toISOString();
  const response = await fetch(url + "/rest/v1/rpc/draft_worker", {
    method: "POST",
    headers: { apikey: key, "Content-Type": "application/json" },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(20000),
  });
  const result = await response.json();
  // This peer receives only null/admission/reply ID results in the prescribed
  // flow. Never print context or a capability if claim ordering is wrong.
  const safeResult = result?.context
    ? { unexpectedClaim: true }
    : response.ok
      ? result
      : { code: result?.code };
  console.log(
    JSON.stringify({
      startedAt,
      finishedAt: new Date().toISOString(),
      status: response.status,
      result: safeResult,
    }),
  );
  if (!response.ok && process.argv[2] !== "--probe") process.exitCode = 1;
} catch {
  console.error(
    "Acceptance HTTP request failed; inspect durable state before retrying.",
  );
  process.exitCode = 1;
}
