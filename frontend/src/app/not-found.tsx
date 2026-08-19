import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="min-h-screen font-sans flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <p className="text-sm font-medium text-primary tracking-wide">404</p>
        <h1 className="mt-3 text-3xl font-semibold text-ink">
          We couldn&apos;t find that page
        </h1>
        <p className="mt-4 text-ink-muted">
          The link may be out of date, or the page may have moved.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block px-6 py-2.5 font-medium text-white bg-primary rounded-md hover:bg-primary/90 transition-colors"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
