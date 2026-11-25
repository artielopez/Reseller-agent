import type { Metadata, Viewport } from "next";
import { PhoneApp } from "@/components/phone-app";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reseller Agent — A second life, simplified",
  description:
    "A personal workspace for secondhand items, photos and assisted listing copy.",
  robots: { index: false, follow: false },
  applicationName: "Reseller Agent",
  icons: { icon: "/favicon.svg", apple: "/icons/icon-180.png" },
  appleWebApp: {
    capable: true,
    title: "Reseller Agent",
    statusBarStyle: "default",
  },
};
export const viewport: Viewport = {
  themeColor: "#275a49",
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Private hosting requires cookies even for a same-origin manifest. */}
        <link
          rel="manifest"
          href="/manifest.webmanifest"
          crossOrigin="use-credentials"
        />
      </head>
      <body>
        {children}
        <PhoneApp />
      </body>
    </html>
  );
}
