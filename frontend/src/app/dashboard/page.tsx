 "use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import { writeSessionStorage } from "@/lib/storage";
import Footer from "@/components/footer";
import AppLoader from "@/components/AppLoader";
import ErrorMessage from "@/components/ErrorMessage";
import PlanStatusBanner from "@/components/PlanStatusBanner";
export default function DashboardPage() {
  const { user, authReady, authError, retryAuth, analyses, analysesLoading, refreshAnalyses } =
    useAuth();
  const router = useRouter();
  const [planStatus, setPlanStatus] = useState<api.UserPlanStatus | null>(null);

  // Plans do not auto-renew, so the dashboard is where a user finds out their
  // pass is running out — before a quota refusal tells them the hard way.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    api
      .getUserPlan()
      .then((status) => {
        if (!cancelled) setPlanStatus(status);
      })
      .catch(() => {
        // Non-essential: the dashboard is still fully usable without the
        // banner, so a failure here must not surface as an error.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    // authError means we could not reach the backend, so "no user" is not
    // evidence of being signed out — redirecting on it would end a valid
    // session over a transient blip.
    if (authReady && !authError && !user) {
      // To /login, NOT to "/". middleware.ts redirects "/" to /dashboard
      // whenever a session cookie is present, and an *expired* cookie still
      // looks present to it — bouncing there would loop
      // /dashboard -> / -> /dashboard forever for exactly the users whose
      // session just ran out. /login is outside the matcher and is also the
      // more useful destination for someone who needs to sign in.
      router.replace("/login");
    }
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
  if (!authReady || !user) return <AppLoader />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        <PlanStatusBanner status={planStatus} />
        <DashboardView
          user={user}
          analyses={analyses}
          analysesLoading={analysesLoading}
          onSelectAnalysis={(a) => {
            // The record can be too large for the ~5 MB sessionStorage cap; if
            // the write is dropped, hand the id over the route instead and let
            // /analysis refetch it rather than throwing QuotaExceededError.
            const cached = writeSessionStorage("currentAnalysis", a);
            router.push(
              cached ? "/analysis" : `/analysis?id=${encodeURIComponent(a.id)}`,
            );
          }}
          onNewAnalysis={() => router.push("/upload")}
          onDeleteAnalysis={async (id) => {
            await api.deleteAnalysis(id);
            await refreshAnalyses();
          }}
        />
      </main>
      <Footer />
    </div>
  );
}
