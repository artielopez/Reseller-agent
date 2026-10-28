import { describe, expect, it } from "vitest";
import {
  itemInputSchema,
  listingSchema,
  generateTemplate,
  formatPHP,
  photoError,
} from "../src/lib/domain";
const item = {
  title: "Wooden desk",
  description: "Small scratch on left edge.",
  price: 2500,
  category: "Home & living",
  condition: "Good",
  status: "Draft",
} as const;
describe("item validation", () => {
  it("accepts complete item facts and trims the title", () => {
    expect(
      itemInputSchema.parse({ ...item, title: " Wooden desk " }).title,
    ).toBe("Wooden desk");
  });
  it.each([
    { price: -1 },
    { price: 1.123 },
    { title: " " },
    { price: "" },
    { status: "Unknown" },
    { description: "x".repeat(4001) },
  ])("rejects invalid item facts: %j", (patch) => {
    expect(itemInputSchema.safeParse({ ...item, ...patch }).success).toBe(
      false,
    );
  });
});
describe("listing URLs", () => {
  it.each([
    "javascript:alert(1)",
    "http://facebook.com/marketplace/item/123",
    "https://facebook.com.evil.test/item/123",
    "https://carousell.ph/p/item-1",
  ])("rejects unsafe or wrong-channel URLs: %s", (url) => {
    expect(
      listingSchema.safeParse({
        channel: "marketplace",
        title: "",
        description: "",
        status: "Published",
        url,
      }).success,
    ).toBe(false);
  });
  it("requires a URL when marked published", () => {
    expect(
      listingSchema.safeParse({
        channel: "marketplace",
        title: "",
        description: "",
        status: "Published",
        url: "",
      }).success,
    ).toBe(false);
  });
  it("accepts a Facebook publication URL", () => {
    expect(
      listingSchema.safeParse({
        channel: "marketplace",
        title: "",
        description: "",
        status: "Published",
        url: "https://www.facebook.com/marketplace/item/123/",
      }).success,
    ).toBe(true);
  });
});
describe("listing drafts", () => {
  it("preserves price, condition, and disclosed defects in every channel", () => {
    const copy = generateTemplate(item);
    for (const channel of ["carousell", "marketplace", "groups"] as const) {
      expect(copy[channel].title).toContain("Wooden desk");
      expect(copy[channel].description).toContain(
        "Small scratch on left edge.",
      );
      expect(copy[channel].description).toContain("2,500");
      expect(copy[channel].description).toContain("Good");
    }
    expect(copy.groups.description).not.toBe(copy.carousell.description);
    expect(copy.marketplace.description).not.toBe(copy.carousell.description);
  });
  it("formats Philippine pesos", () =>
    expect(formatPHP(1250.5)).toBe("₱1,250.50"));
});
describe("photo boundaries", () => {
  it("rejects unsupported formats and oversize input before decoding", () => {
    expect(photoError({ type: "image/svg+xml", size: 500 })).toBeTruthy();
    expect(photoError({ type: "image/jpeg", size: 11000000 })).toBeTruthy();
    expect(photoError({ type: "image/jpeg", size: 500000 })).toBeNull();
  });
});
