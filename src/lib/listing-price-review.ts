import { itemInputSchema, type Listing } from "./domain";

/** Advisory only: amounts can also be shipping fees or discounts. Never rewrite copy. */
export function listingPriceReview(
  listing: Pick<Listing, "title" | "description">,
  price: string,
) {
  const parsed = itemInputSchema.shape.price.safeParse(
    price.trim() ? Number(price) : NaN,
  );
  if (!parsed.success) return { price: null, hasDifferentAmount: false };
  const text = `${listing.title}\n${listing.description}`;
  // Explicit PHP/₱ amounts in ordinary Philippine currency notation only.
  // Do not mistake model numbers, dates, or quantities for asking prices.
  const amounts = text.matchAll(
    /(?:₱|\bPHP\b)\s*((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?)(?!\d|[,.]\d)/gi,
  );
  const hasDifferentAmount = [...amounts].some(
    (match) =>
      Math.round(Number(match[1].replaceAll(",", "")) * 100) !==
      Math.round(parsed.data * 100),
  );
  return { price: parsed.data, hasDifferentAmount };
}
