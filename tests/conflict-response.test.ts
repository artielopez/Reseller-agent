import { afterEach, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { database, asUser, alice } from "./helpers/database";
vi.mock("../src/lib/config", () => ({
  demoMode: false,
  supabaseUrl: "https://synthetic.supabase.co",
  supabaseKey: "sb_publishable_synthetic",
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});
it("uses non-retryable business conflicts in every owned RPC and preserves stale-state rejection", async () => {
  const db = await database();
  try {
    const rows = await db.query<{ proname: string; prosrc: string }>(
      "select proname,prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('buyer_workspace','draft_queue','draft_worker','seller_workspace','delivery_simulation')",
    );
    expect(rows.rows).toHaveLength(5);
    for (const row of rows.rows) {
      expect(row.prosrc, row.proname).not.toMatch(/errcode\s*=\s*'40001'/i);
      expect(row.prosrc, row.proname).toContain("'PT409'");
    }
    await asUser(db, alice);
    const before = await db.query(
      'select public.draft_queue(\'{"op":"list"}\') as state',
    );
    await expect(
      db.query(
        'select public.draft_queue(\'{"op":"pause","paused":false,"expected_revision":"0"}\')',
      ),
    ).rejects.toMatchObject({ code: "PT409" });
    const after = await db.query(
      'select public.draft_queue(\'{"op":"list"}\') as state',
    );
    expect(after.rows).toEqual(before.rows);
  } finally {
    await db.close();
  }
}, 15000);
it.each([409, 503, "network"])(
  "does not automatically replay an RPC after %s",
  async (kind) => {
    const fetcher = vi.fn(async () => {
      if (typeof kind !== "number")
        throw new TypeError("Synthetic disconnection");
      return Response.json(
        { code: "PT409", message: "Synthetic conflict" },
        { status: kind },
      );
    });
    vi.stubGlobal("fetch", fetcher);
    const { getSupabase } = await import("../src/lib/supabase");
    const result = await getSupabase().rpc("draft_queue", {
      command: { op: "enroll", label: "Synthetic" },
    });
    expect(result.error).not.toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  },
  15000,
);

it.each(["40001", "PT409"])(
  "keeps actionable inbox and seller conflict messages for %s",
  async (code) => {
    const fetcher = vi.fn(async () =>
      Response.json(
        { code, message: "Untrusted backend detail" },
        { status: 409 },
      ),
    );
    vi.stubGlobal("fetch", fetcher);
    const { approvedText } = await import("../src/lib/buyer/repository");
    const { sellerWorkspace } = await import("../src/lib/seller/repository");
    await expect(
      approvedText("77777777-7777-4777-8777-777777777777", "1"),
    ).rejects.toThrow("prepare a fresh draft");
    await expect(sellerWorkspace({ op: "get" })).rejects.toThrow(
      "Preferences changed elsewhere",
    );
    expect(fetcher).toHaveBeenCalledTimes(2);
  },
);

it("preserves RPC privileges and also applies without the optional simulation", async () => {
  const db = await database();
  try {
    const privileges = async () =>
      (
        await db.query(
          `select p.oid::regprocedure::text as signature,p.prosecdef,p.proconfig,p.proacl from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname in ('buyer_workspace','draft_queue','draft_worker','seller_workspace') order by signature`,
        )
      ).rows;
    // Restore legacy conflict codes in this isolated fixture so this assertion
    // exercises replacement, not only reapplying an already-current migration.
    await db.exec(`do $$ declare target regprocedure; definition text; begin
      foreach target in array array['public.buyer_workspace(jsonb)'::regprocedure,
        'public.draft_queue(jsonb)'::regprocedure,'public.draft_worker(text,jsonb)'::regprocedure,
        'public.seller_workspace(jsonb)'::regprocedure] loop
        definition:=pg_get_functiondef(target);
        execute replace(definition,'''PT409''','''40001''');
      end loop; end $$;`);
    const before = await privileges();
    await db.exec("drop function public.delivery_simulation(jsonb)");
    await db.exec(
      await readFile(
        "supabase/migrations/20261102202606_non_retryable_conflicts.sql",
        "utf8",
      ),
    );
    expect(await privileges()).toEqual(before);
    expect(
      (
        await db.query(
          `select has_function_privilege('anon','public.draft_worker(text,jsonb)','execute') as worker,has_function_privilege('anon','public.buyer_workspace(jsonb)','execute') as inbox`,
        )
      ).rows[0],
    ).toEqual({ worker: true, inbox: false });
  } finally {
    await db.close();
  }
}, 15000);
