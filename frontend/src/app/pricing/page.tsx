import type { Metadata } from "next";
import PricingView from "./PricingView";

// A server component wrapping the client view purely so this route can export
// its own metadata — a "use client" module cannot. Without it both pages
// inherited the root title verbatim, which is the wrong thing to show in a
// search result for the two routes most worth indexing.
export const metadata: Metadata = {
  title: "Pricing",
  description:
    "Simple plans for contract analysis. Start free with one analysis a day, or buy a 30-day pass for more — no subscription, no auto-renewal.",
  alternates: { canonical: "/pricing" },
  openGraph: {
    title: "Pricing — UnBind AI",
    description:
      "Simple plans for contract analysis. Start free with one analysis a day, or buy a 30-day pass for more — no subscription, no auto-renewal.",
    url: "/pricing",
  },
};

export default function Page() {
  return <PricingView />;
}
