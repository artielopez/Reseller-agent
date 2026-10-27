import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reseller Agent — A second life, simplified",
  description:
    "A personal workspace for secondhand items, photos and assisted listing copy.",
  robots: { index: false, follow: false },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
