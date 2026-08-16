 "use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import { writeSessionStorage } from "@/lib/storage";
import Footer from "@/components/footer";
export default function DashboardPage() {
  const { user, authReady, analyses, analysesLoading, refreshAnalyses } =
    useAuth();
  const router = useRouter();

  useEffect(() => {
    if (authReady && !user) {
      router.replace("/");
    }
  }, [authReady, user, router]);

  if (!authReady || !user) return null;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
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
