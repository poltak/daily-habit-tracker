import type { Metadata, Viewport } from "next";
import "./globals.css";
import { THEME_BOOTSTRAP_SCRIPT } from "../lib/theme";

export const metadata: Metadata = {
  title: "daymark — your daily journal",
  description: "A quiet, personal daily mood and activity journal.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f3ec" },
    { media: "(prefers-color-scheme: dark)", color: "#141b18" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP_SCRIPT }} /></head><body>{children}</body></html>;
}
