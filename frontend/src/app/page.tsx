"use client";

import LandingPage from "@/components/LandingPage";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import DashboardView from "@/components/DashboardView";
export default function HomePage() {
  const { user,analyses } = useAuth();

  const onSelectAnalysis = (analysis: any) => {
  };

  const onNewAnalysis = () => {
  };

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        {user ? <DashboardView user={user} analyses={analyses} onSelectAnalysis={onSelectAnalysis} onNewAnalysis={onNewAnalysis} /> : <LandingPage />}
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
