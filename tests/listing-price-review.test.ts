import { describe, expect, it } from "vitest";
import { listingPriceReview } from "../src/lib/listing-price-review";

describe("listing price review", () => {
  it.each(["₱850, negotiable", "PHP 850, pickup only", "₱850.00, negotiable"])(
    "recognizes a price followed by punctuation: %s",
    (description) => {
      expect(
        listingPriceReview({ title: "Lamp", description }, "900")
          .hasDifferentAmount,
      ).toBe(true);
    },
  );
  it.each(["₱850.00", "PHP 850", "php\u00a0850.00", "₱1,850.50"])(
    "flags a different explicit amount: %s",
    (description) => {
      expect(
        listingPriceReview({ title: "Lamp", description }, "900")
          .hasDifferentAmount,
      ).toBe(true);
    },
  );
  it("checks titles too and keeps shipping differences advisory", () => {
    expect(
      listingPriceReview(
        { title: "Lamp ₱900", description: "Shipping PHP 50" },
        "900",
      ).hasDifferentAmount,
    ).toBe(true);
    expect(
      listingPriceReview({ title: "Lamp ₱850", description: "" }, "900")
        .hasDifferentAmount,
    ).toBe(true);
  });
  it("accepts equivalent cents, grouped thousands and free items", () => {
    for (const [description, price] of [
      ["PHP 1,850.50", "1850.5"],
      ["₱0.00", "0"],
    ]) {
      expect(
        listingPriceReview({ title: "Lamp", description }, price)
          .hasDifferentAmount,
      ).toBe(false);
    }
  });
  it("does not interpret ordinary numbers as currency", () => {
    expect(
      listingPriceReview(
        { title: "Model 850", description: "2 marks, bought in 2024" },
        "900",
      ).hasDifferentAmount,
    ).toBe(false);
  });
  it.each(["", " ", "-1", "NaN", "Infinity", "1.123", "10000000"])(
    "asks for a valid price: %s",
    (price) => {
      expect(
        listingPriceReview({ title: "Lamp", description: "₱850" }, price),
      ).toEqual({ price: null, hasDifferentAmount: false });
    },
  );
});
