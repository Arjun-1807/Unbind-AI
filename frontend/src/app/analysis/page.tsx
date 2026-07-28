"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AnalysisDisplay from "@/components/AnalysisDisplay";
import ErrorMessage from "@/components/ErrorMessage";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import type { AnalysisSummary, StoredAnalysis } from "@/types";
import Footer from "@/components/footer";
export default function AnalysisPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [analysis, setAnalysis] = useState<StoredAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      router.replace("/");
      return;
    }
    const stored = sessionStorage.getItem("currentAnalysis");
    if (!stored) {
      router.replace("/dashboard");
      return;
    }

    let parsed: AnalysisSummary & { documentText?: string };
    try {
      parsed = JSON.parse(stored);
    } catch {
      router.replace("/dashboard");
      return;
    }

    // A record coming straight from an upload already carries its text; one
    // picked from the dashboard list does not, because the history endpoint
    // omits it. Fetch the full record in that case.
    if (typeof parsed.documentText === "string") {
      setAnalysis(parsed as StoredAnalysis);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const full = await api.getAnalysisById(parsed.id);
        if (cancelled) return;
        sessionStorage.setItem("currentAnalysis", JSON.stringify(full));
        setAnalysis(full);
      } catch {
        if (!cancelled) router.replace("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, router]);

  if (!user || !analysis) return null;

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
