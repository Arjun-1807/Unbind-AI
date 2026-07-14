"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LogoIcon } from "../Icons";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";
import Link from "next/dist/client/link";

const LoginView: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unknown error occurred.",
      );
    }
  };

  const handleGoogleSuccess = async (response: CredentialResponse) => {
    if (!response.credential) return;
    setError("");
    try {
      await loginWithGoogle(response.credential);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-in failed.",
      );
    }
  };

  return (
    <div className="flex flex-col items-center justify-center pt-6 sm:pt-10">
      <div className="w-full max-w-3xl mb-4 text-left">
         <Link href="/"><button
            // onClick={onBack}
            className="text-sm text-primary hover:text-primary-hover transition-colors"
          >
            &larr; Back
          </button></Link>
        </div>
      <div className="w-full max-w-md p-6 sm:p-8 space-y-6 ln-card">
        <div className="flex flex-col items-center space-y-2">
          <LogoIcon className="h-12 w-12 text-primary" />
          <h2 className="text-2xl sm:text-3xl font-semibold text-center text-ink">
            Welcome Back
          </h2>
          <p className="text-center text-ink-subtle">
            Sign in to continue to UnBind
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-ink-muted"
            >
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email"
                name="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-ink-muted"
            >
              Password
            </label>
            <div className="mt-1">
              <input
                id="password"
                name="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div>
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 text-sm ln-btn-primary"
            >
              Sign in
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-hairline" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-surface-1 text-ink-subtle">or</span>
          </div>
        </div>

        {/* Google Sign-In */}
        <div className="flex justify-center overflow-x-auto">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-in failed. Please try again.")}
            theme="filled_black"
            shape="rectangular"
            width="368"
            text="continue_with"
          />
        </div>

        <p className="text-sm text-center text-ink-subtle">
          Don&apos;t have an account?{" "}
          <button
            onClick={() => router.push("/signup")}
            className="font-medium text-primary hover:text-primary-hover"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginView;
