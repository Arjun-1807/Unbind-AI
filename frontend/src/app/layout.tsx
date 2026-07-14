import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "UnBind: AI Legal Contract Analyzer",
  description:
    "An AI-powered platform that analyzes complex legal documents. It identifies risky clauses, simplifies jargon, suggests fairer terms, and simulates what-if scenarios.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Site-wide ambient lavender light below the navbar */}
        <div className="page-glow" aria-hidden="true" />
        <Providers>{children}</Providers>
        <Analytics/>
        <SpeedInsights/>
      </body>
    </html>
  );
}
