"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import Header from "@/components/Header";
import Footer from "@/components/footer";
import { useAuth } from "@/context/AuthContext";

export default function ProfilePage() {
  const { user, authReady, analyses } = useAuth();
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
      <main className="container mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        <ProfileView user={user} analyses={analyses} />
      </main>
      <Footer />
    </div>
  );
}
