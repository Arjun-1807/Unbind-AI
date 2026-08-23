"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import LandingPage from "@/components/LandingPage";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import Footer from "@/components/footer";
import AppLoader from "@/components/AppLoader";

export default function HomePage() {
  const { user, authReady } = useAuth();
  const router = useRouter();

  // Signed-in visitors belong on the dashboard, where the real actions live.
  //
  // `middleware.ts` already redirects anyone carrying a session cookie before
  // this page renders at all, so this is the fallback for the cases it can't
  // see — chiefly a client-side navigation to `/`, which never touches the
  // middleware.
  useEffect(() => {
    if (authReady && user) {
      router.replace("/dashboard");
    }
  }, [authReady, user, router]);

  // Deliberately NOT gated on `authReady`.
  //
  // Waiting for `/auth/me` before painting meant the server-rendered HTML for
  // this route was a loader — so every crawler and every link-preview scraper
  // saw a spinner instead of the marketing page, on the one route whose whole
  // job is being found. Signed-out visitors are the overwhelming majority here
  // and their content needs no session, so render it immediately and let the
  // effect above move the rare signed-in arrival.
  if (authReady && user) return <AppLoader />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      {/* Full-bleed on purpose. The landing page owns its own gutters (via
          .ln-shell) so individual sections can paint edge-to-edge bands while
          their contents stay aligned to one column; wrapping it in a padded
          container here also double-padded every section that sets its own.

          No overflow-x-hidden either: it would create a scroll container and
          break the sticky-pinned "How it works" flow section below. */}
      <main className="w-full">
        <LandingPage />
      </main>
      <Footer />
    </div>
  );
}
