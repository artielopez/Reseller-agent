/** Browser permission prompts can leave writeText pending indefinitely. A
 * deadline restores the manual-copy UI; the browser write itself is not
 * cancelable, so never interpret this as proof the clipboard stayed unchanged. */
export async function writeClipboard(
  text: string,
  write: (text: string) => Promise<void> = (value) =>
    navigator.clipboard.writeText(value),
) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(() => write(text)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Clipboard unavailable")),
          3000,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
