import { z } from "zod";
const revision = z.string().regex(/^(0|[1-9][0-9]{0,38})$/);
export const preferencesInputSchema = z
  .object({
    pickup_area: z.string().trim().max(160),
    delivery_notes: z.string().trim().max(500),
    payment_notes: z.string().trim().max(300),
    digest_enabled: z.boolean(),
    digest_time: z.string().regex(/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/),
  })
  .strict();
export const preferencesSchema = preferencesInputSchema
  .extend({
    revision,
    terms_revision: revision,
    last_reviewed_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .refine(
    (p) =>
      p.terms_revision !== "0" ||
      (!p.pickup_area && !p.delivery_notes && !p.payment_notes),
    "Unsaved terms must be empty.",
  );
export const sellerTermsSchema = z
  .object({
    revision: z.string().regex(/^[1-9][0-9]{0,38}$/),
    pickup_area: z.string().max(160),
    delivery_notes: z.string().max(500),
    payment_notes: z.string().max(300),
  })
  .strict();
export type SellerTerms = z.infer<typeof sellerTermsSchema>;
export type Preferences = z.infer<typeof preferencesSchema>;
export type PreferencesInput = z.infer<typeof preferencesInputSchema>;
export function defaultPreferences(): Preferences {
  return {
    revision: "0",
    terms_revision: "0",
    pickup_area: "",
    delivery_notes: "",
    payment_notes: "",
    digest_enabled: false,
    digest_time: "09:00",
    last_reviewed_at: null,
  };
}
export function preferenceValues(p: Preferences): PreferencesInput {
  return {
    pickup_area: p.pickup_area,
    delivery_notes: p.delivery_notes,
    payment_notes: p.payment_notes,
    digest_enabled: p.digest_enabled,
    digest_time: p.digest_time,
  };
}
export function applyPreferences(
  raw: unknown,
  input: unknown,
  expectedRevision: string,
): Preferences {
  const current = preferencesSchema.parse(raw),
    values = preferencesInputSchema.parse(input);
  if (current.revision !== expectedRevision)
    throw new Error(
      "Preferences changed. Reload before saving; your edits are kept.",
    );
  const termsChanged =
    current.pickup_area !== values.pickup_area ||
    current.delivery_notes !== values.delivery_notes ||
    current.payment_notes !== values.payment_notes;
  if (
    !termsChanged &&
    current.digest_enabled === values.digest_enabled &&
    current.digest_time === values.digest_time
  )
    return current;
  return preferencesSchema.parse({
    ...current,
    ...values,
    revision: (BigInt(current.revision) + BigInt(1)).toString(),
    terms_revision: termsChanged
      ? (BigInt(current.terms_revision) + BigInt(1)).toString()
      : current.terms_revision,
  });
}
export function termsContext(raw: Preferences): SellerTerms | undefined {
  const p = preferencesSchema.parse(raw);
  return p.terms_revision === "0"
    ? undefined
    : {
        revision: p.terms_revision,
        pickup_area: p.pickup_area,
        delivery_notes: p.delivery_notes,
        payment_notes: p.payment_notes,
      };
}
export function manilaDayTime(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid review time.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type: string) => parts.find((p) => p.type === type)!.value;
  return {
    day: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}
export function reviewSince(preferences: Preferences, now: string): string {
  return (
    preferences.last_reviewed_at ??
    new Date(manilaDayTime(now).day + "T00:00:00+08:00").toISOString()
  );
}
export function reviewDue(raw: Preferences, now: string): boolean {
  const p = preferencesSchema.parse(raw),
    current = manilaDayTime(now);
  return (
    p.digest_enabled &&
    current.time >= p.digest_time &&
    (!p.last_reviewed_at || manilaDayTime(p.last_reviewed_at).day < current.day)
  );
}
