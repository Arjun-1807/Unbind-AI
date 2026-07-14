"use client";

import LoginView from "@/components/auth/LoginView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import { useRouter } from "next/navigation";
export default function LoginPage() {
  const { user } = useAuth();
  const router = useRouter();
  // Redirect authenticated users away from the login page
  if (user) {
    // In practice this runs only client-side because of "use client"
    router.replace("/dashboard");
    return null;
  }
  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-7xl">
        <LoginView />
      </main>
      <footer className="text-center px-4 py-6 sm:py-8 text-sm text-ink-subtle">
        <div className="flex flex-wrap items-center justify-center gap-2 min-w-0">
          <LogoIcon className="h-6 w-6 flex-shrink-0 text-primary" />
          <p className="break-words">UnBind: AI Legal Contract Analyzer</p>
        </div>
      </footer>
    </div>
  );
}
