"use client";

import SignupView from "@/components/auth/SignupView";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";

export default function SignupPage() {
  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-7xl">
        <SignupView />
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
