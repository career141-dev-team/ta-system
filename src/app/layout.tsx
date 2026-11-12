import type { Metadata } from "next";
// Poppins from a local package, not next/font/google: that one downloads the
// font at dev time, and a dropped connection made every page a 500 (11 Nov 2026).
import "@fontsource/poppins/300.css";
import "@fontsource/poppins/400.css";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "./globals.css";
import TopNav from "./TopNav";

export const metadata: Metadata = {
  title: "TA System",
  description: "Career 141 TA System",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="antialiased">
      {/* From a tablet up the page is exactly one window tall, so a screen can
          fit itself to the height and nothing needs scrolling.
          suppressHydrationWarning: browser extensions (ColorZilla's
          cz-shortcut-listen, Grammarly) write attributes onto <body> before React
          loads; this ignores those attributes only, not the page inside. */}
      <body suppressHydrationWarning className="board flex min-h-dvh flex-col font-sans text-ink md:h-dvh">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
