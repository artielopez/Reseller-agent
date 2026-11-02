/** Trusted, static Node program; no interpolated commands or buyer content.
 * Kept inline so source tests and the compiled worker execute identical code,
 * without a runtime transpiler or an untracked/copy-on-build script. */
export const processSupervisorSource = String.raw`
const {spawn} = require('node:child_process');
const {StringDecoder} = require('node:string_decoder');
const {setTimeout: delay} = require('node:timers/promises');
const lifetime = new AbortController();
let started = false;
const stop = () => {
  lifetime.abort();
  if (!started) process.exit(1);
};
process.once('disconnect', stop);
process.once('SIGTERM', stop);
process.once('SIGINT', stop);
process.on('message', message => {
  if (message?.type === 'abort') { stop(); return; }
  if (started || message?.type !== 'run' || !process.connected) { stop(); return; }
  started = true;
  execute(message).then(result => {
    if (!process.connected) { process.exitCode = 1; return; }
    process.send(result, error => {
      process.exitCode = error ? 1 : 0;
      if (process.connected) process.disconnect();
    });
  }, () => {
    process.exitCode = 1;
    if (process.connected) process.disconnect();
  });
});
if (!process.connected) stop();

async function execute(options) {
  if (lifetime.signal.aborted) throw Error('Stopped');
  const child = spawn(options.executable, options.args, {
    cwd: options.cwd, env: options.env, detached: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let failed = false, stdout = '', stderr = '', size = 0, killTimer;
  const outDecoder = new StringDecoder('utf8'), errDecoder = new StringDecoder('utf8');
  const signalGroup = signal => {
    if (!child.pid) return;
    try { process.kill(-child.pid, signal); }
    // macOS can report EPERM during group teardown. Only the later ESRCH
    // observation proves absence; a surviving/inaccessible group still fails.
    catch (error) { if (!['ESRCH', 'EPERM'].includes(error.code)) failed = true; }
  };
  const terminate = () => {
    signalGroup('SIGTERM');
    killTimer ??= setTimeout(() => signalGroup('SIGKILL'), 200);
  };
  const abort = () => { failed = true; terminate(); };
  const timer = setTimeout(abort, options.timeoutMs);
  lifetime.signal.addEventListener('abort', abort, {once:true});
  child.stdout.on('data', chunk => {
    size += chunk.length;
    if (size > 262144) abort(); else stdout += outDecoder.write(chunk);
  });
  child.stderr.on('data', chunk => {
    size += chunk.length;
    if (size > 262144) abort(); else stderr += errDecoder.write(chunk);
  });
  child.stdin.on('error', abort);
  child.once('exit', terminate);
  try {
    const code = await new Promise(resolve => {
      child.once('error', () => { failed = true; resolve(null); });
      child.once('close', resolve);
      if (lifetime.signal.aborted) abort();
      child.stdin.end(options.input);
    });
    signalGroup('SIGKILL');
    if (child.pid) {
      let alive = true;
      for (let attempt = 0; attempt < 10; attempt++) {
        try { process.kill(-child.pid, 0); }
        catch (error) {
          if (error.code === 'ESRCH') { alive = false; break; }
          if (error.code !== 'EPERM') break;
        }
        await delay(50);
      }
      if (alive) failed = true;
    }
    if (failed || code === null) throw Error('Stopped');
    return {code, stdout:stdout + outDecoder.end(), stderr:stderr + errDecoder.end()};
  } finally {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    lifetime.signal.removeEventListener('abort', abort);
  }
}
`;
