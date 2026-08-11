"use client";

import { useEffect } from "react";
import LoginView from "@/components/auth/LoginView";
import Header from "@/components/Header";
import Footer from "@/components/footer";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const { user, authReady } = useAuth();
  const router = useRouter();

  // Redirect authenticated users away from the login page. Wait for
  // authReady so a valid session cookie doesn't flash the login form
  // before redirecting.
  useEffect(() => {
    if (authReady && user) {
      router.replace("/dashboard");
    }
  }, [authReady, user, router]);

  if (!authReady || user) return null;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-7xl">
        <LoginView />
      </main>
      <Footer />
    </div>
  );
}
