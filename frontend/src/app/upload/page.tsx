"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import Toast from "@/components/Toast";
import Header from "@/components/Header";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import { writeSessionStorage } from "@/lib/storage";
import type { StoredAnalysis, AnalysisProgressEvent } from "@/types";
import Footer from "@/components/footer";
import AppLoader from "@/components/AppLoader";
export default function UploadPage() {
  const { user, authReady, authError, retryAuth, refreshAnalyses } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toastError, setToastError] = useState<{ title: string; message: string } | null>(
    null,
  );
  const abortRef = useRef<AbortController | null>(null);

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

  // Leaving the page mid-analysis must tear the SSE stream down: otherwise its
  // reader keeps pulling frames and pushing progress into an unmounted page.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleStartAnalysis = useCallback(
    async (file: File, role: string) => {
      if (!user) {
        setError("You must be logged in to analyze a document.");
        return;
      }
      setError(null);
      setToastError(null);
      setIsLoading(true);
      setLoadingMessage("Uploading and analyzing document...");

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const result = await api.uploadAndAnalyzeStream(
          file,
          role,
          (event: AnalysisProgressEvent) => {
            if (controller.signal.aborted) return;
            setLoadingMessage(event.message);
          },
          controller.signal,
        );
        if (controller.signal.aborted) return;
        await refreshAnalyses();
        // The record carries the whole extracted document text, which can be
        // larger than the ~5 MB sessionStorage cap. When the write is dropped,
        // hand the id over the route instead and let /analysis refetch it.
        const cached = writeSessionStorage<StoredAnalysis>(
          "currentAnalysis",
          result,
        );
        router.push(
          cached ? "/analysis" : `/analysis?id=${encodeURIComponent(result.id)}`,
        );
      } catch (err) {
        // An abort is this page unmounting, not a failure to report.
        if (controller.signal.aborted) return;
        const errorMessage =
          err instanceof Error ? err.message : "Unknown analysis error";
        // Map known error codes to friendly guidance; HEIC/unreadable-image
        // errors already arrive as human-readable sentences (from the server's
        // detail), so they fall through to setError as-is.
        if (errorMessage === "NOT_A_LEGAL_DOCUMENT") {
          setToastError({
            title: "Not a Legal Document",
            message:
              "This does not appear to be a legal document. Please upload a contract, agreement, or other legal document.",
          });
        } else if (errorMessage === "OCR_INSUFFICIENT_TEXT") {
          setToastError({
            title: "Couldn't Read That Image",
            message:
              "We couldn't read enough text from that image. Try a clearer, well-lit photo with the page filling the frame — or upload the file as a PDF/DOCX.",
          });
        } else if (errorMessage === "IMAGE_TOO_LARGE") {
          setToastError({
            title: "Image Too Large",
            message: "That image is too large (max 15 MB). Please upload a smaller photo.",
          });
        } else if (errorMessage === "FILE_TOO_LARGE") {
          setToastError({
            title: "File Too Large",
            message:
              "That file is too large (max 25 MB). Try splitting the document or uploading a smaller export.",
          });
        } else {
          setError(errorMessage);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setLoadingMessage("");
        }
      }
    },
    [user, router, refreshAnalyses],
  );

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

  if (isLoading) return <LoadingSpinner message={loadingMessage} />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      {toastError && (
        <Toast
          title={toastError.title}
          message={toastError.message}
          onRetry={() => setToastError(null)}
        />
      )}
      <main className="container mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-10 lg:px-8">
        {error && (
          <ErrorMessage
            message={error}
            onRetry={() => {
              setError(null);
            }}
          />
        )}
        {!error && !toastError && (
          <FileUpload
            onStartAnalysis={handleStartAnalysis}
            onBack={() => router.push("/dashboard")}
          />
        )}
      </main>
      <Footer />
    </div>
  );
}
