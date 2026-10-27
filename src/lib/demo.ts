import { channels, generateTemplate, type Item } from "./domain";
const examples = [
  {
    title: "Sony WH-1000XM4 headphones",
    price: 6500,
    category: "Electronics",
    condition: "Good",
    status: "Listed",
    description:
      "Black wireless headphones with original case. Light wear on the ear pads. Charging cable included.",
    image: "headphones",
  },
  {
    title: "Everyday canvas tote",
    price: 450,
    category: "Fashion",
    condition: "Like new",
    status: "Ready",
    description:
      "Natural canvas bag with an inner pocket. Used twice, no stains or tears.",
    image: "tote",
  },
  {
    title: "Oak bedside table",
    price: 1800,
    category: "Home & living",
    condition: "Good",
    status: "Draft",
    description:
      "Compact bedside table with one drawer. Small scratch on the top surface.",
    image: "table",
  },
  {
    title: "Classic white sneakers",
    price: 1200,
    category: "Fashion",
    condition: "Fair",
    status: "Reserved",
    description:
      "Size EU 40. Cleaned and ready for a new owner. Visible creasing and wear on the soles.",
    image: "sneakers",
  },
] as const;
export function demoItems(): Item[] {
  return examples.map((sample, index) => {
    const copy = generateTemplate(sample);
    return {
      ...sample,
      id: `00000000-0000-4000-8000-00000000000${index + 1}`,
      updatedAt: new Date().toISOString(),
      photos: [{ id: `sample-${index}`, url: `/demo/${sample.image}.svg` }],
      listings: channels.map((channel) => ({
        channel,
        ...copy[channel],
        status: "Not posted",
        url: "",
      })),
    };
  });
}
