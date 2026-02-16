"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LogoIcon } from "../Icons";

const SignupView: React.FC = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // ...existing code...
  const [error, setError] = useState("");
  const { signup } = useAuth();
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
    if (password.length < 6) {
      setError("Password must be at least 6 characters long.");
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

  return (
    <div className="flex flex-col items-center justify-center pt-10">
      <div className="w-full max-w-md p-8 space-y-6 bg-gray-800/40 rounded-lg shadow-xl border border-indigo-500/20">
        <div className="flex flex-col items-center space-y-2">
          <LogoIcon className="h-12 w-12 text-indigo-400" />
          <h2 className="text-2xl font-bold text-center text-white">
            Create an Account
          </h2>
          <p className="text-center text-gray-400">
            Join UnBind to save and manage your analyses
          </p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div>
            <label
              htmlFor="username-signup"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="email-signup"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="password-signup"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="confirm-password-signup"
              className="block text-sm font-medium text-gray-300"
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
                className="w-full p-3 bg-gray-900 border border-gray-600 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
              />
            </div>
            {/* Pro user toggle removed */}
          </div>

          {error && <p className="text-sm text-red-400">{error}</p>}

          <div>
            <button
              type="submit"
              className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              Sign up
            </button>
          </div>
        </form>
        <p className="text-sm text-center text-gray-400">
          Already have an account?{" "}
          <button
            onClick={() => router.push("/login")}
            className="font-medium text-indigo-400 hover:text-indigo-300"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
};

export default SignupView;
