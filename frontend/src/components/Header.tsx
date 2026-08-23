"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { APP_NAME } from "@/constants";
import { LogoIcon, UserIcon, LogOutIcon, SunIcon, MoonIcon } from "./Icons";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { useActiveSection } from "@/hooks/useActiveSection";
import { LANDING_VIEW_EVENT, type LandingView } from "@/lib/landingView";
import Link from "next/link";

/* The landing page's own sections, in the order they're scrolled through.
   Signed-out visitors arrive with no idea what the product does, so the
   centre of the navbar — which for signed-in users points at the app — is
   better spent telling them what's further down the page. Kept short on
   purpose: the page has more sections than this, but a nav that lists every
   one stops being a summary and starts being a table of contents.

   Order must match document order — useActiveSection breaks ties by position
   in this array, so a mismatch would highlight the wrong link where two
   sections overlap the observer band. */
const LANDING_SECTIONS = [
  { id: "how-it-works", label: "How it works" },
  { id: "features", label: "Features" },
  { id: "pricing", label: "Pricing" },
  { id: "cli", label: "CLI" },
  { id: "faq", label: "FAQ" },
] as const;

const Header: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = React.useState(false);

  // The landing page swaps to a lawyer sign-up view in place, which unmounts
  // every anchored section. Track it so the nav goes with them.
  const [landingView, setLandingView] = React.useState<LandingView>("clients");
  React.useEffect(() => {
    const onView = (e: Event) =>
      setLandingView((e as CustomEvent<LandingView>).detail);
    window.addEventListener(LANDING_VIEW_EVENT, onView);
    return () => window.removeEventListener(LANDING_VIEW_EVENT, onView);
  }, []);

  // The anchors only exist on the landing route, in its client view; linking
  // to them from /pricing, /login or the lawyer view would scroll nowhere.
  const showSections = !user && pathname === "/" && landingView === "clients";
  const sectionIds = React.useMemo(
    () => (showSections ? LANDING_SECTIONS.map((s) => s.id) : []),
    [showSections],
  );
  const activeSection = useActiveSection(sectionIds);

  // Close the mobile sheet on navigation — the hash routes don't unmount
  // anything, so nothing else would.
  React.useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

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
          {/* Not an <h1>: this renders on every route, so making the wordmark a
              top-level heading gave each page two competing h1s and pushed the
              real page heading down the document outline. */}
          <span className="truncate text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {APP_NAME}
          </span>
        </div>

        {/* ── Zone 2: Center nav ──
            Same slot, same pill vocabulary in both states: signed-in users get
            the app link, signed-out visitors get the page's own sections. */}
        {showSections && (
          <nav
            aria-label="Page sections"
            className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-1 rounded-full border border-hairline bg-surface-1 p-1"
          >
            {LANDING_SECTIONS.map((section) => {
              const isActive = activeSection === section.id;
              return (
                <a
                  key={section.id}
                  href={`#${section.id}`}
                  aria-current={isActive ? "true" : undefined}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? "bg-surface-3 text-ink"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {section.label}
                </a>
              );
            })}
          </nav>
        )}

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
                  // OAuth avatars come from arbitrary remote hosts; next/image
                  // would need every provider domain whitelisted in
                  // images.remotePatterns and throws at runtime on any that
                  // isn't. A plain <img> is the safe choice for a 24px avatar.
                  // eslint-disable-next-line @next/next/no-img-element
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
              onClick={toggleTheme}
              className="inline-flex items-center justify-center h-9 w-9 text-sm font-medium text-ink-muted bg-surface-1 border border-hairline rounded-full hover:bg-surface-2 transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>
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
            <button
              onClick={toggleTheme}
              className="inline-flex items-center justify-center h-9 w-9 text-sm font-medium text-ink-muted bg-surface-1 border border-hairline rounded-full hover:bg-surface-2 transition-colors"
              title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <SunIcon className="h-4 w-4" />
              ) : (
                <MoonIcon className="h-4 w-4" />
              )}
            </button>
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
            {/* Mobile menu toggle — the only route to the section links once
                the centre nav drops out below md. */}
            {showSections && (
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="md:hidden inline-flex items-center justify-center h-9 w-9 text-ink-muted bg-surface-1 border border-hairline rounded-md hover:bg-surface-2 transition-colors"
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
            )}
          </div>
        )}

      </div>

      {/* ── Mobile dropdown menu (signed-out landing) ── */}
      {showSections && menuOpen && (
        <nav
          aria-label="Page sections"
          className="md:hidden mt-3 pt-3 border-t border-hairline flex flex-col gap-1 fade-in"
        >
          {LANDING_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={() => setMenuOpen(false)}
              aria-current={activeSection === section.id ? "true" : undefined}
              className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                activeSection === section.id
                  ? "bg-surface-2 text-ink"
                  : "text-ink-muted hover:bg-surface-1 hover:text-ink"
              }`}
            >
              {section.label}
            </a>
          ))}
          <Link
            href="/login"
            onClick={() => setMenuOpen(false)}
            className="mt-1 sm:hidden inline-flex items-center justify-center px-3 py-2 text-sm ln-btn-secondary"
          >
            Sign in
          </Link>
        </nav>
      )}

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
          <button
            onClick={() => {
              toggleTheme();
              setMenuOpen(false);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-md text-ink-muted bg-surface-1 border border-hairline hover:bg-surface-2 transition-colors"
          >
            {theme === "dark" ? (
              <SunIcon className="h-4 w-4 text-primary shrink-0" />
            ) : (
              <MoonIcon className="h-4 w-4 text-primary shrink-0" />
            )}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
        </nav>
      )}
    </header>
  );
};

export default Header;
