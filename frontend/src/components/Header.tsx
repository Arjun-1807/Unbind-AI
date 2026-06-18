"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { APP_NAME } from "@/constants";
import { LogoIcon, UserIcon, LogOutIcon } from "./Icons";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleReset = () => {
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <header className="py-4 px-4 sm:px-6 lg:px-8 bg-gray-900/60 backdrop-blur-lg border-b border-indigo-500/10 sticky top-0 z-10">
      <div className="container mx-auto flex justify-between items-center max-w-7xl">

        {/* ── Zone 1: Brand (left) ── */}
        <div
          className="flex items-center space-x-3 cursor-pointer group"
          onClick={handleReset}
          title="Go to Dashboard"
        >
          <LogoIcon className="h-8 w-8 text-indigo-500 group-hover:text-indigo-400 transition-colors" />
          <h1 className="text-2xl font-bold text-gray-100 tracking-tight">
            {APP_NAME}
          </h1>
        </div>

        {/* ── Zone 2: Center nav — only visible when logged in ── */}
        {user && (
          <nav className="hidden sm:flex absolute left-1/2 -translate-x-1/2">
            <Link
              href="/lawyers"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-full border transition-all duration-200"
              style={{
                color: "#f59e0b",
                borderColor: "rgba(245,158,11,0.4)",
                background: "rgba(245,158,11,0.08)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  "rgba(245,158,11,0.18)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow =
                  "0 0 14px rgba(245,158,11,0.2)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.background =
                  "rgba(245,158,11,0.08)";
                (e.currentTarget as HTMLAnchorElement).style.boxShadow = "none";
              }}
            >
              {/* Scales of justice icon */}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4 shrink-0"
              >
                <path d="M12 3v18M5 6l7-3 7 3M3 9l4 8H1l4-8zM17 9l4 8h-8l4-8z" />
              </svg>
              Find a Lawyer
            </Link>
          </nav>
        )}

        {/* ── Zone 3: User controls (right) ── */}
        {user ? (
          <div className="flex items-center space-x-3">
            <Link href="/profile">
              <div className="flex items-center space-x-2 text-sm text-gray-300 hover:text-white transition-colors">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.username}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <UserIcon className="h-5 w-5 text-indigo-400" />
                )}
                <span className="hidden sm:inline">{user.username}</span>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center h-9 w-9 text-sm font-medium text-indigo-300 bg-white/5 border border-indigo-500/20 rounded-full hover:bg-indigo-500/20 transition-colors"
              title="Logout"
            >
              <LogOutIcon className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center justify-center px-4 py-2 text-sm font-medium text-indigo-300 bg-white/5 border border-indigo-500/20 rounded-md hover:bg-indigo-500/10 transition-colors"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-500 transition-colors"
            >
              Get started
            </Link>
          </div>
        )}

      </div>
    </header>
  );
};

export default Header;
