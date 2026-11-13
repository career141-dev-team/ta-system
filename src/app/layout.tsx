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
      {/* On every device the page is exactly one window tall, so a screen fits
          itself to the height and anything longer scrolls inside its own card. A
          phone once got a page that grew without end: the board's columns fill
          their height, so an unbounded page kept growing (13 Nov 2026).
          suppressHydrationWarning: browser extensions (ColorZilla's
          cz-shortcut-listen, Grammarly) write attributes onto <body> before React
          loads; this ignores those attributes only, not the page inside. */}
      <body suppressHydrationWarning className="board flex h-dvh flex-col font-sans text-ink">
        <TopNav />
        {children}
      </body>
    </html>
  );
}
