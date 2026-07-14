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
  const [menuOpen, setMenuOpen] = React.useState(false);

  const handleReset = () => {
    setMenuOpen(false);
    if (user) {
      router.push("/dashboard");
    } else {
      router.push("/");
    }
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    await logout();
    router.push("/");
  };

  return (
    <header className="py-3 px-4 sm:px-6 lg:px-8 bg-canvas/80 backdrop-blur-lg border-b border-hairline sticky top-0 z-10">
      <div className="container mx-auto flex justify-between items-center max-w-7xl">

        {/* ── Zone 1: Brand (left) ── */}
        <div
          className="flex items-center space-x-2 sm:space-x-3 cursor-pointer group min-w-0"
          onClick={handleReset}
          title="Go to Dashboard"
        >
          <LogoIcon className="h-7 w-7 sm:h-8 sm:w-8 shrink-0 text-primary group-hover:text-primary-hover transition-colors" />
          <h1 className="text-xl sm:text-2xl font-semibold text-ink tracking-tight truncate">
            {APP_NAME}
          </h1>
        </div>

        {/* ── Zone 2: Center nav — only visible when logged in ── */}
        {user && (
          <nav className="hidden sm:flex absolute left-1/2 -translate-x-1/2">
            <Link
              href="/lawyers"
              className="inline-flex items-center gap-2 px-4 py-1.5 text-sm font-medium rounded-full border border-hairline bg-surface-1 text-ink-muted hover:bg-surface-2 hover:text-ink transition-colors duration-200"
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
                className="h-4 w-4 shrink-0 text-primary"
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
              <div className="flex items-center space-x-2 text-sm text-ink-muted hover:text-ink transition-colors">
                {user.picture ? (
                  <img
                    src={user.picture}
                    alt={user.username}
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <UserIcon className="h-5 w-5 text-primary" />
                )}
                <span className="hidden sm:inline">{user.username}</span>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              className="inline-flex items-center justify-center h-9 w-9 text-sm font-medium text-ink-muted bg-surface-1 border border-hairline rounded-full hover:bg-surface-2 transition-colors"
              title="Logout"
            >
              <LogOutIcon className="h-4 w-4" />
            </button>
            {/* Mobile menu toggle — surfaces the nav links hidden on small screens */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="sm:hidden inline-flex items-center justify-center h-9 w-9 text-ink-muted bg-surface-1 border border-hairline rounded-md hover:bg-surface-2 transition-colors"
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.8}
                stroke="currentColor"
                className="h-5 w-5"
              >
                {menuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5M3.75 17.25h16.5" />
                )}
              </svg>
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3">
            <Link
              href="/login"
              className="hidden sm:inline-flex items-center justify-center px-3.5 py-1.5 text-sm ln-btn-secondary"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center px-3.5 py-1.5 text-sm ln-btn-primary"
            >
              Get started
            </Link>
          </div>
        )}

      </div>

      {/* ── Mobile dropdown menu (logged-in only) ── */}
      {user && menuOpen && (
        <nav className="sm:hidden mt-3 pt-3 border-t border-hairline flex flex-col gap-2 fade-in">
          <Link
            href="/lawyers"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-ink-muted bg-surface-1 border border-hairline hover:bg-surface-2 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.8}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0 text-primary"
            >
              <path d="M12 3v18M5 6l7-3 7 3M3 9l4 8H1l4-8zM17 9l4 8h-8l4-8z" />
            </svg>
            Find a Lawyer
          </Link>
          <Link
            href="/profile"
            onClick={() => setMenuOpen(false)}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-ink-muted bg-surface-1 border border-hairline hover:bg-surface-2 transition-colors"
          >
            <UserIcon className="h-4 w-4 text-primary shrink-0" />
            Profile
          </Link>
        </nav>
      )}
    </header>
  );
};

export default Header;
