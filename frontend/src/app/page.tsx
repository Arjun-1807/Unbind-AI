"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/footer";
export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();

  // If the user is already authenticated, always send them to the real dashboard
  // so all dashboard actions (analysis navigation, new analysis, etc.) work correctly.
  useEffect(() => {
    if (user) {
      router.replace("/dashboard");
    }
  }, [user, router]);

  // While redirecting, render nothing to avoid showing a partially wired dashboard.
  if (user) return null;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        <LandingPage />
      </main>
      <Footer />
    </div>
  );
}
