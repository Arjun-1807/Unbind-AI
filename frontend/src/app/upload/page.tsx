"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import Toast from "@/components/Toast";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import type { StoredAnalysis, AnalysisProgressEvent } from "@/types";
import footer from "@/components/footer";
export default function UploadPage() {
  const { user, refreshAnalyses } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) router.replace("/");
  }, [user, router]);

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

      try {
        const result = await api.uploadAndAnalyzeStream(
          file,
          role,
          (event: AnalysisProgressEvent) => {
            setLoadingMessage(event.message);
          },
        );
        await refreshAnalyses();
        sessionStorage.setItem("currentAnalysis", JSON.stringify(result));
        router.push("/analysis");
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : "Unknown analysis error";
        // Map known error codes to friendly guidance; HEIC/unreadable-image
        // errors already arrive as human-readable sentences (from the server's
        // detail), so they fall through to setError as-is.
        if (errorMessage === "NOT_A_LEGAL_DOCUMENT") {
          setToastError(
            "This does not appear to be a legal document. Please upload a contract, agreement, or other legal document.",
          );
        } else if (errorMessage === "OCR_INSUFFICIENT_TEXT") {
          setToastError(
            "We couldn't read enough text from that image. Try a clearer, well-lit photo with the page filling the frame — or upload the file as a PDF/DOCX.",
          );
        } else if (errorMessage === "IMAGE_TOO_LARGE") {
          setToastError(
            "That image is too large (max 15 MB). Please upload a smaller photo.",
          );
        } else {
          setError(errorMessage);
        }
      } finally {
        setIsLoading(false);
        setLoadingMessage("");
      }
    },
    [user, router, refreshAnalyses],
  );

  if (!user) return null;

  if (isLoading) return <LoadingSpinner message={loadingMessage} />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      {toastError && (
        <Toast
          message={toastError}
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
      <footer />
    </div>
  );
}
