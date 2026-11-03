import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { database } from "./helpers/database";

it("runs the hosted draft acceptance transaction and leaves no fixtures or quota", async () => {
  const db = await database();
  try {
    await db.exec(
      readFileSync("scripts/acceptance/hosted-draft-queue.sql", "utf8"),
    );
    const result = await db.query(`select
      (select count(*)::int from auth.users) as users,
      (select count(*)::int from public.items) as items,
      (select count(*)::int from public.buyer_inquiries) as inquiries,
      (select count(*)::int from public.suggested_replies) as replies,
      (select count(*)::int from public.draft_workers) as workers,
      (select count(*)::int from public.draft_jobs) as jobs,
      (select count(*)::int from public.ai_usage) as usage`);
    expect(result.rows[0]).toEqual({
      users: 2,
      items: 0,
      inquiries: 0,
      replies: 0,
      workers: 0,
      jobs: 0,
      usage: 0,
    });
  } finally {
    await db.close();
  }
}, 30000);
