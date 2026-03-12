 "use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import DashboardView from "@/components/DashboardView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import Footer from "@/components/footer";
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
      <Footer />
    </div>
  );
}
