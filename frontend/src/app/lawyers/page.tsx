import type { Metadata } from "next";
import LawyersView from "./LawyersView";

// A server component wrapping the client view purely so this route can export
// its own metadata — a "use client" module cannot. Without it both pages
// inherited the root title verbatim, which is the wrong thing to show in a
// search result for the two routes most worth indexing.
export const metadata: Metadata = {
  title: "Lawyer Directory",
  description:
    "When AI analysis isn't enough, escalate to a human. Browse vetted lawyers by specialization and city, and reach them directly.",
  alternates: { canonical: "/lawyers" },
  openGraph: {
    title: "Lawyer Directory — UnBind AI",
    description:
      "When AI analysis isn't enough, escalate to a human. Browse vetted lawyers by specialization and city, and reach them directly.",
    url: "/lawyers",
  },
};

export default function Page() {
  return <LawyersView />;
}
