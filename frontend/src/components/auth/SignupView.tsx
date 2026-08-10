"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { LogoIcon } from "../Icons";
import { type CredentialResponse } from "@react-oauth/google";
import BackLink from "../BackLink";
import ResponsiveGoogleButton from "./ResponsiveGoogleButton";

const SignupView: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState("");
  const { signup, loginWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim()) {
      setError("Username is required.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    // Must match the server policy in SignupRequest (min_length=8), otherwise
    // the UI accepts a password the API rejects with a raw 422.
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (!agreedToTerms) {
      setError(
        "You must agree to the Terms of Service and Privacy Policy to continue.",
      );
      return;
    }

    try {
      await signup(username, email, password);
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
    if (!agreedToTerms) {
      setError(
        "You must agree to the Terms of Service and Privacy Policy to continue.",
      );
      return;
    }
    try {
      await loginWithGoogle(response.credential);
      router.push("/dashboard");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Google sign-up failed.",
      );
    }
  };

  return (
    <div className="flex flex-col items-center py-6 sm:py-10">
      <div className="w-full max-w-3xl mb-4 text-left">
        <BackLink href="/" />
      </div>
      <div className="w-full max-w-md p-6 sm:p-8 space-y-6 ln-card">
        <div className="flex flex-col items-center space-y-1.5">
          <LogoIcon className="h-10 w-10 text-primary" />
          <h2 className="text-2xl sm:text-3xl font-semibold text-center text-ink">
            Create an Account
          </h2>
          <p className="text-center text-ink-subtle">
            Join UnBind to save and manage your analyses
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="username-signup"
              className="block text-sm font-medium text-ink-muted"
            >
              Username
            </label>
            <div className="mt-1">
              <input
                id="username-signup"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="email-signup"
              className="block text-sm font-medium text-ink-muted"
            >
              Email address
            </label>
            <div className="mt-1">
              <input
                id="email-signup"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password-signup"
              className="block text-sm font-medium text-ink-muted"
            >
              Password
            </label>
            <div className="mt-1">
              <input
                id="password-signup"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="confirm-password-signup"
              className="block text-sm font-medium text-ink-muted"
            >
              Confirm Password
            </label>
            <div className="mt-1">
              <input
                id="confirm-password-signup"
                name="confirm-password"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="ln-input w-full p-3"
              />
            </div>
          </div>

          <div className="flex items-start gap-2">
            <input
              id="agree-to-terms"
              name="agree-to-terms"
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-hairline text-primary focus:ring-primary"
            />
            <label htmlFor="agree-to-terms" className="text-sm text-ink-subtle">
              I agree to the{" "}
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
            </label>
          </div>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div>
            <button
              type="submit"
              disabled={!agreedToTerms}
              className="w-full flex justify-center py-3 px-4 text-sm ln-btn-primary cursor-pointer"
            >
              Sign up
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

        {/* Google Sign-Up */}
        <ResponsiveGoogleButton
          onSuccess={handleGoogleSuccess}
          onError={() => setError("Google sign-up failed. Please try again.")}
        />

        <p className="text-sm text-center text-ink-subtle">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/login")}
            className="font-medium text-primary hover:text-primary-hover"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default SignupView;
