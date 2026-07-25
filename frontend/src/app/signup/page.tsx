"use client";

import SignupView from "@/components/auth/SignupView";
import Header from "@/components/Header";
import Footer from "@/components/footer";

export default function SignupPage() {
  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-6 sm:py-10 max-w-7xl">
        <SignupView />
      </main>
      <Footer />
    </div>
  );
}
