/** Bound UI waits even if a transport/Auth lock ignores AbortSignal.
 * Cancellation is best effort: a timed-out write may still have committed.
 * Callers must reconcile durable state; this helper never retries work.
 */
export async function withRequestDeadline<T>(
  work: (signal: AbortSignal) => PromiseLike<T>,
  message: string,
  parent?: AbortSignal,
  timeoutMs = 15_000,
): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel: (() => void) | undefined;
  try {
    const expired = new Promise<never>((_, reject) => {
      cancel = () => {
        reject(new Error(message));
        controller.abort();
      };
      if (parent?.aborted) cancel();
      else {
        parent?.addEventListener("abort", cancel, { once: true });
        timer = setTimeout(cancel, timeoutMs);
      }
    });
    return await Promise.race([
      expired,
      Promise.resolve().then(() => {
        if (controller.signal.aborted) throw new Error(message);
        return work(controller.signal);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    if (cancel) parent?.removeEventListener("abort", cancel);
    controller.abort();
  }
}
