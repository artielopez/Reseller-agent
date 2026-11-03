"use client";
import { useEffect, useState } from "react";
import type { QueueState } from "@/lib/automation/draft-controls";
import { workerHealth } from "@/lib/automation/worker-health";

export function WorkerHealthSummary({ state }: { state: QueueState }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const health = workerHealth(state, now);
  return (
    <div className="notice">
      <p>
        <strong>{health.title}</strong>
      </p>
      <p>{health.detail}</p>
      <p>
        {health.lastCompletedAt
          ? `Last completed draft in the latest 100 jobs: ${new Date(health.lastCompletedAt).toLocaleString()}.`
          : "No completed draft in the latest 100 jobs."}
      </p>
      <p>
        Recorded activity only. Timing uses this device’s clock. Refresh to
        check for new activity.
      </p>
    </div>
  );
}
