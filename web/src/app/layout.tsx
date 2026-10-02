import type { Metadata, Viewport } from "next";
import { THEME_INIT_SCRIPT } from "@/shared/theme/theme";
import { OfflineBanner } from "@/shared/ui/molecules/OfflineBanner";
import { SiteHeader } from "@/shared/ui/organisms/SiteHeader";
import "./globals.css";

export const metadata: Metadata = {
  title: "F1 Live Tracker",
  description: "Race weekend schedule, countdown, live circuit map and timing.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Matches --color-bg of each theme (follows the OS; an explicit override keeps the OS one).
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#0f1115" },
  ],
  // Both supported; the inline script narrows <html> to the resolved theme.
  colorScheme: "light dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The inline script sets data-theme / color-scheme on <html> before the
    // first paint, so the server and client attributes differ by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <SiteHeader />
        <OfflineBanner />
        {children}
      </body>
    </html>
  );
}
