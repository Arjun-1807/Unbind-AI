"use client";

import React, { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LogoIcon } from "../Icons";
import { type CredentialResponse } from "@react-oauth/google";
import BackLink from "../BackLink";
import ResponsiveGoogleButton from "./ResponsiveGoogleButton";

const LoginView: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, loginWithGoogle } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  /**
   * Where to land after a successful sign-in.
   *
   * /pricing sends users here as `/login?next=/pricing` when they try to buy
   * while signed out; ignoring it dropped them on the dashboard and quietly
   * ended the purchase. Only same-origin paths are honoured — an absolute URL
   * in `next` would make this an open redirect.
   */
  const nextPath = (() => {
    const raw = searchParams.get("next");
    if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/dashboard";
    return raw;
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await login(email, password);
      router.push(nextPath);
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
      router.push(nextPath);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-in failed.",
      );
    }
  };

  return (
    <div className="flex flex-col items-center py-6 sm:py-10">
      <div className="w-full max-w-3xl mb-4 text-left">
        <BackLink href="/" />
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

          <p className="text-xs text-ink-tertiary text-center">
            By continuing, you agree to our{" "}
            <Link
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary hover:text-primary-hover underline"
            >
              Privacy Policy
            </Link>
            .
          </p>
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
        <ResponsiveGoogleButton
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google sign-in failed. Please try again.")}
        />

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
