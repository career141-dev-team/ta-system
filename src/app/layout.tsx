import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TA System",
  description: "Career 141 TA System",
};

// No next/font/google here: it downloads the font at dev time, and a dropped
// connection made every page a 500 (11 Nov 2026). The system font stack needs
// no network; pick a bundled face later if the design wants one.
export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
