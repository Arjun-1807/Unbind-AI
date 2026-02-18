 "use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";

export default function DashboardPage() {
  const { user, analyses, refreshAnalyses } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!user) {
      router.replace("/login");
    }
  }, [user, router]);

  if (!user) return null;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        <DashboardView
          user={user}
          analyses={analyses}
          onSelectAnalysis={(a) => {
            sessionStorage.setItem("currentAnalysis", JSON.stringify(a));
            router.push("/analysis");
          }}
          onNewAnalysis={() => router.push("/upload")}
          onDeleteAnalysis={async (id) => {
            await api.deleteAnalysis(id);
            await refreshAnalyses();
          }}
        />
      </main>
      <footer className="text-center py-8 text-sm text-gray-500">
        <div className="flex items-center justify-center space-x-2">
          <LogoIcon className="h-6 w-6 text-indigo-500" />
          <p>UnBind: AI Legal Contract Analyzer</p>
        </div>
      </footer>
    </div>
  );
}
