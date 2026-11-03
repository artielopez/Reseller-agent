/** Trusted, static Node program; no interpolated commands or buyer content.
 * Kept inline so source tests and the compiled worker execute identical code,
 * without a runtime transpiler or an untracked/copy-on-build script. */
export const processSupervisorSource = String.raw`
const {spawn} = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');
let started = false, closing = false;
// This process anchors the group before it can receive a run command. Targets
// inherit this group. The caller knows its ID even if we crash during spawn.
const signalGroup = signal => {
  try { process.kill(-process.pid, signal); }
  catch { process.exit(1); }
};
const stop = () => {
  if (closing) return;
  closing = true;
  signalGroup('SIGTERM');
  setTimeout(() => signalGroup('SIGKILL'), 200);
};
process.once('disconnect', stop);
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
process.on('message', message => {
  if (message?.type === 'abort') { stop(); return; }
  if (started || closing || message?.type !== 'run' || !process.connected) { stop(); return; }
  started = true;
  execute(message);
});
if (!process.connected) stop();

function execute(options) {
  let child;
  try {
    child = spawn(options.executable, options.args, {
      cwd: options.cwd, env: options.env, detached: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch { stop(); return; }
  let stdout = '', stderr = '', size = 0, drainTimer;
  const outDecoder = new StringDecoder('utf8'), errDecoder = new StringDecoder('utf8');
  const timer = setTimeout(stop, options.timeoutMs);
  child.stdout.on('data', chunk => {
    size += chunk.length;
    if (size > 262144) stop(); else stdout += outDecoder.write(chunk);
  });
  child.stderr.on('data', chunk => {
    size += chunk.length;
    if (size > 262144) stop(); else stderr += errDecoder.write(chunk);
  });
  child.stdin.on('error', stop);
  child.once('error', stop);
  // A descendant retaining the pipes must not keep a completed target alive.
  // If output cannot drain promptly, fail closed instead of returning partial output.
  child.once('exit', () => { drainTimer = setTimeout(stop, 200); });
  child.once('close', code => {
    clearTimeout(timer);
    clearTimeout(drainTimer);
    if (closing || code === null || !process.connected) { stop(); return; }
    process.send({code, stdout:stdout + outDecoder.end(), stderr:stderr + errDecoder.end()},
      error => { if (error) stop(); });
    // Stay as group anchor until the caller kills/verifies the whole group.
    // IPC loss also calls stop if the caller dies before receiving the result.
  });
  child.stdin.end(options.input);
}
`;
