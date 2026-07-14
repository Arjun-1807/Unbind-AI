"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
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
      <footer className="px-4 py-6 text-center text-sm text-ink-subtle sm:py-8">
        <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
          <LogoIcon className="h-6 w-6 text-primary" />
          <p className="break-words">UnBind: AI Legal Contract Analyzer</p>
        </div>
      </footer>
    </div>
  );
}
