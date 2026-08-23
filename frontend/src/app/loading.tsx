"use client";

import AppLoader from "@/components/AppLoader";

// Route-level suspense fallback. Neutral copy: this fires on any navigation,
// not just contract analysis.
export default function Loading() {
  return <AppLoader />;
}
