import { describe, expect, it } from "vitest";
import type { QueueState } from "../src/lib/automation/draft-controls";
import {
  workerHealth,
  jobRecovery,
  questionJob,
} from "../src/lib/automation/worker-health";
const now = Date.parse("2026-11-03T04:00:00Z");
const worker = {
  id: "w",
  label: "Mac",
  expires_at: "2026-11-04T04:00:00Z",
  revoked_at: null,
  last_seen_at: null,
};
const state: QueueState = {
  paused: false,
  revision: "1",
  workers: [worker],
  jobs: [],
};
describe("honest worker health", () => {
  it("keeps pause ahead of contact and excludes revoked and expired keys", () => {
    expect(workerHealth({ ...state, paused: true }, now).title).toBe(
      "Drafting is paused",
    );
    for (const w of [
      { ...worker, revoked_at: new Date(now).toISOString() },
      { ...worker, expires_at: new Date(now).toISOString() },
    ])
      expect(workerHealth({ ...state, workers: [w] }, now).title).toBe(
        "No active worker key",
      );
  });
  it("distinguishes no contact, recent contact, stale contact and future clock skew", () => {
    expect(workerHealth(state, now).title).toBe("Waiting for worker contact");
    const contact = (age: number) =>
      workerHealth(
        {
          ...state,
          workers: [
            { ...worker, last_seen_at: new Date(now - age).toISOString() },
          ],
        },
        now,
      );
    expect(contact(30_000).title).toBe("Recent worker contact");
    expect(contact(5 * 60_000).title).toBe("Worker contact is old");
    expect(contact(-60_000).title).toBe("Check device time");
    expect(contact(0).detail).toContain("does not confirm");
  });
  it("reports only the newest successful job in the returned window", () => {
    const jobs = [
      job("completed", "2026-11-03T02:00:00Z"),
      job("failed", "2026-11-03T03:59:00Z"),
      job("completed", "2026-11-03T03:00:00Z"),
    ];
    expect(workerHealth({ ...state, jobs }, now).lastCompletedAt).toBe(
      "2026-11-03T03:00:00Z",
    );
    expect(workerHealth(state, now).lastCompletedAt).toBeNull();
  });
  it("never exposes arbitrary failure text and explains lease/context recovery", () => {
    expect(
      jobRecovery({ ...job("failed"), reason: "lease_expired" }),
    ).toContain("Do not retry automatically");
    expect(
      jobRecovery({ ...job("failed"), reason: "context_changed" }),
    ).toContain("saved facts");
    expect(
      jobRecovery({ ...job("failed"), reason: "private credential" }),
    ).not.toContain("private credential");
    expect(jobRecovery(job("completed"))).toContain("review");
  });
  it("finds this question's active job before terminal history, regardless of ordering", () => {
    expect(
      questionJob(
        [job("queued"), job("completed", "2026-11-03T04:00:00Z")],
        "q",
      )?.status,
    ).toBe("queued");
    expect(
      questionJob([{ ...job("queued"), inquiry_id: "other" }], "q"),
    ).toBeUndefined();
  });
});
function job(
  status: QueueState["jobs"][number]["status"],
  updated_at = "2026-11-03T03:00:00Z",
): QueueState["jobs"][number] {
  return {
    id: status + updated_at,
    inquiry_id: "q",
    status,
    reason: null,
    created_at: updated_at,
    updated_at,
  };
}
