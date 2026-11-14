import type { DraftJobOutcome } from "../lib/automation/draft-worker";
export async function runWorkerLoop(options: {
  watch: boolean;
  signal: AbortSignal;
  job: () => {
    run: () => Promise<DraftJobOutcome>;
    close: () => Promise<void>;
  };
  wait: () => Promise<void>;
  report: (outcome: DraftJobOutcome) => void;
}): Promise<string> {
  while (!options.signal.aborted) {
    const job = options.job();
    let outcome: DraftJobOutcome;
    try {
      outcome = await job.run();
    } finally {
      await job.close();
    }
    options.report(outcome);
    if (!options.watch || !["idle", "completed"].includes(outcome.status))
      return outcome.status;
    if (!options.signal.aborted) await options.wait();
  }
  return "stopped";
}
