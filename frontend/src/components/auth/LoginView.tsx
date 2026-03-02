"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LogoIcon } from "../Icons";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";

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
    <div className="flex flex-col items-center justify-center pt-10">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800/40 rounded-lg shadow-xl border border-indigo-500/20">
        <div className="flex flex-col items-center space-y-2">
          <LogoIcon className="h-12 w-12 text-indigo-400" />
          <h2 className="text-2xl font-bold text-center text-white">
            Welcome Back
          </h2>
          <p className="text-center text-gray-400">
            Sign in to continue to UnBind
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div>
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Sign in
            </button>
          </div>
        </form>

        {/* Divider */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-600" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-gray-800/40 text-gray-400">or</span>
          </div>
        </div>

        {/* Google Sign-In */}
        <div className="flex justify-center">
          <GoogleLogin
            onSuccess={handleGoogleSuccess}
            onError={() => setError("Google sign-in failed. Please try again.")}
            theme="filled_black"
            shape="rectangular"
            width="368"
            text="continue_with"
          />
        </div>

        <p className="text-sm text-center text-gray-400">
          Don&apos;t have an account?{" "}
          <button
            onClick={() => router.push("/signup")}
            className="font-medium text-indigo-400 hover:text-indigo-300"
          >
            Sign up
          </button>
        </p>
      </div>
    </div>
  );
};

export default LoginView;
