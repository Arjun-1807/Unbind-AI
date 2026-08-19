"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import ProfileView from "@/components/ProfileView";
import Header from "@/components/Header";
import Footer from "@/components/footer";
import { useAuth } from "@/context/AuthContext";
import AppLoader from "@/components/AppLoader";
import ErrorMessage from "@/components/ErrorMessage";

export default function ProfilePage() {
  const { user, authReady, authError, retryAuth, analyses } = useAuth();
  const router = useRouter();
  useEffect(() => {
    // authError means we could not reach the backend, so "no user" is not
    // evidence of being signed out — redirecting on it would end a valid
    // session over a transient blip.
    if (authReady && !authError && !user) {
      // To /login, NOT to "/". middleware.ts redirects "/" to /dashboard
      // whenever a session cookie is present, and an *expired* cookie still
      // looks present to it — bouncing there would loop
      // /dashboard -> / -> /dashboard forever for exactly the users whose
      // session just ran out. /login is outside the matcher and is also the
      // more useful destination for someone who needs to sign in.
      router.replace("/login");
    }
  }, [authReady, authError, user, router]);

  if (authError)
    return (
      <ErrorMessage
        title="Can't reach UnBind"
        message="We couldn't confirm your session. This is usually a connection problem, not a sign-out."
        onRetry={retryAuth}
        retryLabel="Retry"
      />
    );
  if (!authReady || !user) return <AppLoader />;

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
