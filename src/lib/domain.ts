import { z } from "zod";

export const statuses = [
  "Draft",
  "Ready",
  "Listed",
  "Reserved",
  "Sold",
] as const;
export const conditions = ["Like new", "Good", "Fair", "For parts"] as const;
export const categories = [
  "Electronics",
  "Fashion",
  "Home & living",
  "Sports & outdoors",
  "Books & hobbies",
  "Other",
] as const;
export const channels = ["carousell", "marketplace", "groups"] as const;
export type Channel = (typeof channels)[number];
export const channelNames: Record<Channel, string> = {
  carousell: "Carousell",
  marketplace: "Facebook Marketplace",
  groups: "Facebook Groups",
};
export const channelLinks: Record<Channel, string> = {
  carousell: "https://www.carousell.ph/",
  marketplace: "https://www.facebook.com/marketplace/",
  groups: "https://www.facebook.com/groups/",
};
export const publicationStatuses = [
  "Not posted",
  "Published",
  "Removed",
] as const;
export const MAX_PHOTOS = 6;

export const itemInputSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2, "Add a title with at least 2 characters.")
    .max(120),
  description: z.string().trim().max(4000),
  price: z.number().finite().min(0).max(9999999.99).multipleOf(0.01),
  category: z.enum(categories),
  condition: z.enum(conditions),
  status: z.enum(statuses),
});
export type ItemInput = z.infer<typeof itemInputSchema>;
export const listingSchema = z
  .object({
    channel: z.enum(channels),
    title: z.string().max(160),
    description: z.string().max(6000),
    status: z.enum(publicationStatuses),
    url: z.string().trim().max(2048),
  })
  .superRefine((listing, ctx) => {
    if (!listing.url) {
      if (listing.status === "Published")
        ctx.addIssue({
          code: "custom",
          path: ["url"],
          message: "Add the listing URL before marking it published.",
        });
      return;
    }
    try {
      const url = new URL(listing.url);
      const domain =
        listing.channel === "carousell" ? "carousell.ph" : "facebook.com";
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        !(url.hostname === domain || url.hostname.endsWith(`.${domain}`))
      )
        throw new Error();
    } catch {
      ctx.addIssue({
        code: "custom",
        path: ["url"],
        message: `Use an HTTPS ${listing.channel === "carousell" ? "carousell.ph" : "facebook.com"} listing URL.`,
      });
    }
  });
export type Listing = z.infer<typeof listingSchema>;
export type Photo = { id: string; url: string; path?: string };
export type Item = ItemInput & {
  id: string;
  photos: Photo[];
  listings: Listing[];
  updatedAt: string;
};
export const copySchema = z.object({
  title: z.string(),
  description: z.string(),
});
export const generatedCopySchema = z.object({
  carousell: copySchema,
  marketplace: copySchema,
  groups: copySchema,
});
export type GeneratedCopy = z.infer<typeof generatedCopySchema>;

export function formatPHP(price: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    minimumFractionDigits: 2,
  }).format(price);
}
export function emptyItem(): Item {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    price: 0,
    category: "Other",
    condition: "Good",
    status: "Draft",
    photos: [],
    listings: channels.map((channel) => ({
      channel,
      title: "",
      description: "",
      status: "Not posted",
      url: "",
    })),
    updatedAt: new Date().toISOString(),
  };
}
export function generateTemplate(
  item: Pick<
    ItemInput,
    "title" | "description" | "price" | "condition" | "category"
  >,
): GeneratedCopy {
  const facts = `${item.description}\n\nCondition: ${item.condition}\nPrice: ${formatPHP(item.price)}`;
  return {
    carousell: {
      title: item.title,
      description: `${facts}\nCategory: ${item.category}\n\nMessage me if you have a question about this item.`,
    },
    marketplace: {
      title: item.title,
      description: `${item.title} — ${formatPHP(item.price)}\n\n${item.description}\n\nCondition: ${item.condition}\nSend a message to discuss collection or delivery.`,
    },
    groups: {
      title: `For sale: ${item.title}`,
      description: `FOR SALE · ${item.title}\n\n${facts}\n\nPlease comment or message if interested. Collection or delivery details to be agreed.`,
    },
  };
}
export function photoError(file: {
  type: string;
  size: number;
}): string | null {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    return "Choose JPEG, PNG or WebP photos. On iPhone, export HEIC photos as JPEG first.";
  if (file.size > 10 * 1024 * 1024)
    return "Each photo must be 10 MB or smaller.";
  if (file.size === 0) return "This photo is empty. Choose another file.";
  return null;
}
export function validateItem(item: Item): void {
  itemInputSchema.parse(item);
  z.array(listingSchema).length(3).parse(item.listings);
  if (new Set(item.listings.map((listing) => listing.channel)).size !== 3)
    throw new Error("Each channel must appear exactly once.");
  if (item.photos.length > MAX_PHOTOS)
    throw new Error(`Use up to ${MAX_PHOTOS} photos.`);
}
export function errorMessage(error: unknown): string {
  if (error instanceof z.ZodError)
    return error.issues
      .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
      .join(" ");
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
