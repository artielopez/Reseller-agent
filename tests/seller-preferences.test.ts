import { expect, it } from "vitest";
import {
  defaultPreferences,
  preferencesInputSchema,
  applyPreferences,
  reviewDue,
  termsContext,
} from "../src/lib/seller/preferences";
it("starts without inferred terms or reminders and validates bounded fields and Manila time", () => {
  const initial = defaultPreferences();
  expect(initial).toMatchObject({
    revision: "0",
    terms_revision: "0",
    pickup_area: "",
    delivery_notes: "",
    payment_notes: "",
    digest_enabled: false,
    digest_time: "09:00",
    last_reviewed_at: null,
  });
  expect(termsContext(initial)).toBeUndefined();
  const values = {
    pickup_area: "",
    delivery_notes: "",
    payment_notes: "",
    digest_enabled: false,
    digest_time: "09:00",
  };
  expect(
    preferencesInputSchema.parse({ ...values, pickup_area: "x".repeat(160) })
      .pickup_area,
  ).toHaveLength(160);
  expect(() =>
    preferencesInputSchema.parse({ ...values, pickup_area: "x".repeat(161) }),
  ).toThrow();
  for (const time of ["24:00", "9:00", "12:60"])
    expect(() =>
      preferencesInputSchema.parse({
        pickup_area: "",
        delivery_notes: "",
        payment_notes: "",
        digest_enabled: true,
        digest_time: time,
      }),
    ).toThrow();
});
it("versions terms separately from reminder settings and rejects stale saves", () => {
  const initial = defaultPreferences();
  const input = {
    pickup_area: "Quezon City",
    delivery_notes: "",
    payment_notes: "",
    digest_enabled: false,
    digest_time: "09:00",
  };
  const saved = applyPreferences(initial, input, "0");
  expect(saved).toMatchObject({
    revision: "1",
    terms_revision: "1",
    pickup_area: "Quezon City",
  });
  const reminder = applyPreferences(
    saved,
    { ...input, digest_enabled: true },
    "1",
  );
  expect(reminder).toMatchObject({ revision: "2", terms_revision: "1" });
  expect(termsContext(reminder)).toEqual(termsContext(saved));
  expect(() => applyPreferences(reminder, input, "1")).toThrow();
  expect(
    applyPreferences(reminder, { ...input, digest_enabled: true }, "2"),
  ).toEqual(reminder);
});
it("shows one optional in-app review per Manila day after the selected time", () => {
  const preferences = { ...defaultPreferences(), digest_enabled: true };
  expect(reviewDue(preferences, "2026-10-31T00:59:00Z")).toBe(false);
  expect(reviewDue(preferences, "2026-10-31T01:00:00Z")).toBe(true);
  expect(
    reviewDue(
      { ...preferences, last_reviewed_at: "2026-10-31T00:00:00Z" },
      "2026-10-31T01:00:00Z",
    ),
  ).toBe(false);
  expect(
    reviewDue(
      { ...preferences, last_reviewed_at: "2026-10-30T15:59:00Z" },
      "2026-10-31T01:00:00Z",
    ),
  ).toBe(true);
  expect(reviewDue(defaultPreferences(), "2026-10-31T01:00:00Z")).toBe(false);
});

it("summarizes saved questions and reviewing changes no question status or reply text", async () => {
  const { localSellerWorkspace } = await import("../src/lib/seller/workspace");
  const { initialBuyerState } = await import("../src/lib/buyer/local");
  const state = initialBuyerState();
  // No inferred platform inbox: an empty saved inbox remains empty after review.
  const get = localSellerWorkspace(
    undefined,
    state,
    [],
    { op: "get" },
    "2026-10-31T01:00:00Z",
  );
  expect(get.result.summary).toMatchObject({
    total: 0,
    open: 0,
    ready: 0,
    needs_review: 0,
    received: 0,
    since: "2026-10-30T16:00:00.000Z",
  });
  const reviewed = localSellerWorkspace(
    get.result.preferences,
    get.state,
    [],
    { op: "review", expected_revision: "0" },
    "2026-10-31T01:01:00Z",
  );
  expect(reviewed.state).toEqual(state);
  expect(reviewed.result.preferences.terms_revision).toBe("0");
  expect(() =>
    localSellerWorkspace(reviewed.result.preferences, reviewed.state, [], {
      op: "review",
      expected_revision: "0",
    }),
  ).toThrow();
});
