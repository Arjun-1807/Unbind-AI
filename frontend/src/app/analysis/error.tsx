"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ErrorMessage from "@/components/ErrorMessage";
import Header from "@/components/Header";
import Footer from "@/components/footer";

/**
 * Error boundary scoped to the /analysis route segment. If rendering the
 * analysis view throws (malformed result, unexpected shape, etc.) this shows a
 * retry state instead of a blank screen. `reset` re-renders the segment;
 * "Back to dashboard" is offered as an escape hatch.
 */
export default function AnalysisError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-10 max-w-7xl">
        <ErrorMessage
          title="Couldn't display this analysis"
          message={
            error.message || "Something went wrong while displaying the analysis."
          }
          onRetry={reset}
        />
        <div className="flex justify-center mt-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="px-6 py-2 ln-btn-secondary rounded-md"
          >
            Back to dashboard
          </button>
        </div>
      </main>
      <Footer />
    </div>
  );
}
