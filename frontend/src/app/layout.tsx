import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TAGLINE, SITE_URL } from "@/lib/site";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  // Required for Next to resolve the relative URLs below into the absolute
  // ones Open Graph and canonical tags must carry.
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME}: ${SITE_TAGLINE}`,
    // Per-page titles render as "Pricing — UnBind AI" without each page
    // repeating the brand.
    template: `%s — ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "contract analysis",
    "legal document analyzer",
    "AI contract review",
    "rental agreement review",
    "employment contract review",
    "plain English contract",
  ],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    url: "/",
    locale: "en_IN",
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME}: ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
  },
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
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        {/* Site-wide ambient lavender light below the navbar */}
        <div className="page-glow" aria-hidden="true" />
        {/*
          Structured data. Lets search engines render the product name, price
          range and rating context as a rich result rather than a plain link.
          Injected as a raw script tag because JSON-LD must not be escaped as
          text; the content is a literal we control, not user input.
        */}
        <script
          type="application/ld+json"
          // nosemgrep: typescript.react.security.audit.react-dangerouslysetinnerhtml.react-dangerouslysetinnerhtml -- JSON.stringify over a module-level literal; no user input reaches this, and JSON-LD cannot be expressed as escaped text children.
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "SoftwareApplication",
              name: SITE_NAME,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Web",
              url: SITE_URL,
              description: SITE_DESCRIPTION,
              offers: [
                {
                  "@type": "Offer",
                  name: "Free",
                  price: "0",
                  priceCurrency: "INR",
                },
                {
                  "@type": "Offer",
                  name: "Brief",
                  price: "100",
                  priceCurrency: "INR",
                },
                {
                  "@type": "Offer",
                  name: "Motion",
                  price: "450",
                  priceCurrency: "INR",
                },
                {
                  "@type": "Offer",
                  name: "Verdict",
                  price: "2500",
                  priceCurrency: "INR",
                },
              ],
            }),
          }}
        />
        <Providers>{children}</Providers>
        <Analytics/>
        <SpeedInsights/>
      </body>
    </html>
  );
}
