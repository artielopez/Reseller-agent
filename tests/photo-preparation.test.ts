import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { preparePhoto } from "../src/lib/photos";
let release: () => void;
const decode = vi.fn(),
  canvas = vi.fn(),
  clear = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  decode.mockReturnValue(
    new Promise<void>((resolve) => {
      release = resolve;
    }),
  );
  vi.stubGlobal(
    "Image",
    class {
      src = "";
      width = 100;
      height = 100;
      decode = decode;
      removeAttribute = clear;
    },
  );
  vi.stubGlobal("document", { createElement: canvas });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:synthetic-photo");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
const photo = () => new File(["synthetic"], "test.png", { type: "image/png" });
it("releases stalled photo decoding and its temporary URL without late encoding", async () => {
  let outcome: unknown;
  void preparePhoto(photo()).catch((error) => {
    outcome = error;
  });
  await vi.advanceTimersByTimeAsync(30_001);
  expect(outcome).toBeInstanceOf(Error);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:synthetic-photo");
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(canvas).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("cancels decoding when the owner's editor is left without preparing a later result", async () => {
  const controller = new AbortController();
  let outcome: unknown;
  void preparePhoto(photo(), controller.signal).catch((error) => {
    outcome = error;
  });
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  await vi.advanceTimersByTimeAsync(1);
  expect(outcome).toBeInstanceOf(Error);
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  release();
  await vi.advanceTimersByTimeAsync(1);
  expect(canvas).not.toHaveBeenCalled();
});
