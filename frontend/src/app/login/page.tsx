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
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        <LoginView />
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
