"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnalysisDisplay from "@/components/AnalysisDisplay";
import ErrorMessage from "@/components/ErrorMessage";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import { readSessionStorage, writeSessionStorage } from "@/lib/storage";
import type { AnalysisSummary, StoredAnalysis } from "@/types";
import Footer from "@/components/footer";
import AppLoader from "@/components/AppLoader";
export default function AnalysisPage() {
  const { user, authReady, authError, retryAuth } = useAuth();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Wait for /auth/me: `user` is null until it resolves, and acting on that
    // would both bounce a signed-in user home and skip the stored analysis.
    if (!authReady) return;
    // authError means the session check never reached the backend, so "no
    // user" is not evidence of being signed out — hold rather than bounce.
    if (authError) return;
    if (!user) {
      // /login rather than "/": see the note in dashboard/page.tsx — an expired
      // cookie still satisfies middleware.ts, so "/" would loop.
      router.replace("/login");
      return;
    }
    const stored =
      readSessionStorage<AnalysisSummary & { documentText?: string }>(
        "currentAnalysis",
      );
    // Callers whose record was too large for sessionStorage hand the id over
    // the route instead; that path always needs a fetch. Read it off the URL
    // directly so this page needs no Suspense boundary.
    const idFromQuery = new URLSearchParams(window.location.search).get("id");
    if (!stored && !idFromQuery) {
      router.replace("/dashboard");
      return;
    }

    // A record coming straight from an upload already carries its text; one
    // picked from the dashboard list does not, because the history endpoint
    // omits it. Fetch the full record in that case.
    if (stored && typeof stored.documentText === "string") {
      setAnalysis(stored as StoredAnalysis);
      return;
    }

    const id = stored?.id ?? idFromQuery;
    if (!id) {
      router.replace("/dashboard");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const full = await api.getAnalysisById(id);
        if (cancelled) return;
        writeSessionStorage<StoredAnalysis>("currentAnalysis", full);
        setAnalysis(full);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, authError, user, router]);

  if (authError)
    return (
      <ErrorMessage
        title="Can't reach UnBind"
        message="We couldn't confirm your session. This is usually a connection problem, not a sign-out."
        onRetry={retryAuth}
        retryLabel="Retry"
      />
    );
  if (!authReady || !user || !analysis) return <AppLoader />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 md:py-10 max-w-7xl">
        {error ? (
          <ErrorMessage
            message={error}
            onRetry={() => setError(null)}
            retryLabel="Dismiss"
          />
        ) : (
          <AnalysisDisplay
            analysisResult={analysis.analysisResult}
            documentText={analysis.documentText}
            analysisId={analysis.id}
            onError={setError}
            onBackToDashboard={() => router.push("/dashboard")}
          />
        )}
      </main>
      <Footer/>
    </div>
  );
}
