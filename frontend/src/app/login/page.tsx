"use client";

import LoginView from "@/components/auth/LoginView";
import Header from "@/components/Header";
import Footer from "@/components/footer";
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
      <Footer />
    </div>
  );
}
