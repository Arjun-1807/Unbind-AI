"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import FileUpload from "@/components/FileUpload";
import Loading from "../loading";
import LoadingSpinner from "@/components/LoadingSpinner";
import ErrorMessage from "@/components/ErrorMessage";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import { useAuth } from "@/context/AuthContext";
import * as api from "@/services/api";
import type { StoredAnalysis } from "@/types";

export default function UploadPage() {
  const { user, refreshAnalyses } = useAuth();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) router.replace("/login");
  }, [user, router]);

  const handleStartAnalysis = useCallback(
    async (file: File, role: string) => {
      if (!user) {
        setError("You must be logged in to analyze a document.");
        return;
      }
      setError(null);
      setIsLoading(true);
      setLoadingMessage("Uploading and analyzing document...");

      try {
        const result = await api.uploadAndAnalyze(file, role);
        await refreshAnalyses();
        sessionStorage.setItem("currentAnalysis", JSON.stringify(result));
        router.push("/analysis");
      } catch (err: any) {
        setError(err.message || "Unknown analysis error");
      } finally {
        setIsLoading(false);
        setLoadingMessage("");
      }
    },
    [user, router, refreshAnalyses],
  );

  if (!user) return null;

  if (isLoading) return <Loading />;

  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 py-10 max-w-7xl">
        {error && (
          <ErrorMessage
            message={error}
            onRetry={() => {
              setError(null);
            }}
          />
        )}
        {!error && (
          <FileUpload
            onStartAnalysis={handleStartAnalysis}
            onBack={() => router.push("/dashboard")}
          />
        )}
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
