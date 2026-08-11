"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/footer";
export default function HomePage() {
  const { user, authReady } = useAuth();
  const router = useRouter();

  // If the user is already authenticated, always send them to the real dashboard
  // so all dashboard actions (analysis navigation, new analysis, etc.) work correctly.
  // Wait for authReady so a valid session cookie doesn't flash the landing page
  // before redirecting.
  useEffect(() => {
    if (authReady && user) {
      router.replace("/dashboard");
    }
  }, [authReady, user, router]);

  // While the auth check is pending, or while redirecting, render nothing.
  if (!authReady || user) return null;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      {/* No overflow-x-hidden here: it would create a scroll container and
          break the sticky-pinned "How it works" flow section below. */}
      <main className="container mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <LandingPage />
      </main>
      <Footer />
    </div>
  );
}
