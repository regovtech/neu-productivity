import type { Metadata } from "next";
import "./globals.css";
import { CookieConsentBanner } from "@/components/CookieConsentBanner";

export const metadata: Metadata = {
  title: "Neu — Productivity Platform",
  description: "Stay productive at all times with incremental goals and measurable outcomes.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-gray-900 antialiased">
        {children}
        <CookieConsentBanner />
      </body>
    </html>
  );
}
