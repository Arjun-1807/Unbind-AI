"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getLawyers, contactLawyer, getUserPlan } from "@/services/api";
import type { LawyerProfile } from "@/types";
import Header from "@/components/Header";
import Footer from "@/components/footer";
// ─── Small icon components (inline to avoid extra deps) ─────────────────────

const StarIcon = ({ filled }: { filled: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 20 20"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth={1.5}
    className="h-4 w-4"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
    />
  </svg>
);

const BadgeCheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="currentColor"
    className="h-4 w-4 text-primary"
  >
    <path
      fillRule="evenodd"
      d="M8.603 3.799A4.49 4.49 0 0112 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 013.498 1.307 4.491 4.491 0 011.307 3.497A4.49 4.49 0 0121.75 12a4.49 4.49 0 01-1.549 3.397 4.491 4.491 0 01-1.307 3.497 4.491 4.491 0 01-3.497 1.307A4.49 4.49 0 0112 21.75a4.49 4.49 0 01-3.397-1.549 4.491 4.491 0 01-3.497-1.307 4.491 4.491 0 01-1.307-3.497A4.49 4.49 0 012.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 011.307-3.497 4.491 4.491 0 013.497-1.307zm7.007 6.387a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z"
      clipRule="evenodd"
    />
  </svg>
);

const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-5 w-5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const CheckIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={2}
    stroke="currentColor"
    className="h-12 w-12 text-success"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

// ─── All known specializations for filter pills ──────────────────────────────

const ALL_SPECIALIZATIONS = [
  "Employment",
  "Real Estate",
  "NDA",
  "SaaS",
  "Corporate",
  "Technology",
  "Compliance",
  "Construction",
  "Intellectual Property",
  "M&A",
];

// ─── Star rating renderer ────────────────────────────────────────────────────

const StarRating = ({ rating }: { rating: number }) => {
  const full = Math.floor(rating);
  return (
    <div className="flex items-center gap-0.5 text-yellow-400">
      {[1, 2, 3, 4, 5].map((i) => (
        <StarIcon key={i} filled={i <= full} />
      ))}
      <span className="ml-1 text-xs text-ink-subtle">{rating.toFixed(1)}</span>
    </div>
  );
};

// ─── Contact Modal ───────────────────────────────────────────────────────────

interface ContactModalProps {
  lawyer: LawyerProfile;
  userEmail: string;
  onClose: () => void;
  onSuccess: () => void;
}

const ContactModal: React.FC<ContactModalProps> = ({
  lawyer,
  userEmail,
  onClose,
  onSuccess,
}) => {
  const [message, setMessage] = useState("");
  const [contactEmail, setContactEmail] = useState(userEmail);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) {
      setError("Please enter a message.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      await contactLawyer(lawyer.id, message.trim(), contactEmail);
      onSuccess();
    } catch (err: any) {
      setError(err.message || "Failed to send request. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Trap focus & close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg ln-card rounded-2xl p-6 sm:p-8 relative fade-in">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-ink-subtle hover:text-ink transition-colors"
          aria-label="Close modal"
        >
          <XIcon />
        </button>

        <h3 className="text-xl font-semibold text-ink mb-1">
          Contact {lawyer.name}
        </h3>
        <p className="text-sm text-ink-subtle mb-6">
          {lawyer.specializations.join(" · ")} · {lawyer.city}
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="contact-email"
              className="block text-sm font-medium text-ink-muted mb-1"
            >
              Your Email
            </label>
            <input
              id="contact-email"
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              className="w-full px-4 py-2 ln-input"
            />
          </div>

          <div>
            <label
              htmlFor="contact-message"
              className="block text-sm font-medium text-ink-muted mb-1"
            >
              Your Message
            </label>
            <textarea
              id="contact-message"
              rows={5}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              placeholder="Describe your legal matter briefly. Include any relevant contract details or specific questions."
              className="w-full px-4 py-2 ln-input resize-none"
            />
          </div>

          {error && (
            <p className="text-sm text-danger bg-danger/10 px-3 py-2 rounded-md">
              {error}
            </p>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 inline-flex cursor-pointer justify-center items-center px-4 py-2 text-sm ln-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Sending…" : "Send Request"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="cursor-pointer px-4 py-2 text-sm ln-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Success overlay ─────────────────────────────────────────────────────────

const SuccessOverlay: React.FC<{ lawyerName: string; onDone: () => void }> = ({
  lawyerName,
  onDone,
}) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
    <div className="w-full max-w-sm ln-card rounded-2xl p-8 text-center fade-in">
      <div className="flex justify-center mb-4">
        <CheckIcon />
      </div>
      <h3 className="text-xl font-semibold text-ink mb-2">Request Sent!</h3>
      <p className="text-sm text-ink-subtle mb-6">
        Your message has been forwarded to{" "}
        <span className="text-primary font-medium">{lawyerName}</span>. They
        will reach out to you shortly.
      </p>
      <button
        onClick={onDone}
        className="w-full inline-flex justify-center items-center px-4 py-2 text-sm ln-btn-primary"
      >
        Done
      </button>
    </div>
  </div>
);

// ─── Lawyer Card ─────────────────────────────────────────────────────────────

interface LawyerCardProps {
  lawyer: LawyerProfile;
  onContact: (lawyer: LawyerProfile) => void;
}

const LawyerCard: React.FC<LawyerCardProps> = ({ lawyer, onContact }) => (
  <div className="ln-card rounded-xl p-5 sm:p-6 flex flex-col gap-4 hover:bg-surface-2 transition-colors duration-300">
    {/* Header row */}
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {/* Avatar initial */}
        <div className="h-12 w-12 rounded-full bg-primary flex items-center justify-center text-white text-xl font-semibold shrink-0">
          {lawyer.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <h3 className="font-semibold text-ink text-lg leading-tight break-words">
              {lawyer.name}
            </h3>
            {lawyer.verified && (
              <span title="Verified lawyer" className="shrink-0">
                <BadgeCheckIcon />
              </span>
            )}
          </div>
          <p className="text-xs text-ink-subtle mt-0.5">{lawyer.city}</p>
        </div>
      </div>
      {/* Experience badge */}
      <span className="shrink-0 text-xs font-medium text-primary bg-surface-2 border border-hairline px-2.5 py-1 rounded-full">
        {lawyer.experienceYears}y exp
      </span>
    </div>

    {/* Specialization pills */}
    <div className="flex flex-wrap gap-2">
      {lawyer.specializations.map((s) => (
        <span
          key={s}
          className="text-sm cursor-pointer font-medium text-ink-muted bg-surface-2 border border-hairline px-2.5 py-0.5 rounded-full"
        >
          {s}
        </span>
      ))}
    </div>

    {/* Bio */}
    <p className="text-md text-ink-subtle leading-relaxed line-clamp-3">
      {lawyer.bio}
    </p>

    {/* Footer: rating + contact */}
    <div className="flex items-center justify-between gap-3 mt-auto pt-2 border-t border-hairline">
      {lawyer.rating && lawyer.rating > 0 ? (
        <StarRating rating={lawyer.rating} />
      ) : (
        <span className="text-xs text-ink-tertiary">No rating yet</span>
      )}
      <button
        onClick={() => onContact(lawyer)}
        className="inline-flex cursor-pointer items-center shrink-0 px-4 py-1.5 text-sm ln-btn-primary"
      >
        Contact
      </button>
    </div>
  </div>
);

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function LawyersPage() {
  const { user, authReady } = useAuth();
  const router = useRouter();

  const [isVerdict, setIsVerdict] = useState<boolean | null>(null);
  const [lawyers, setLawyers] = useState<LawyerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [contactLawyerTarget, setContactLawyerTarget] =
    useState<LawyerProfile | null>(null);
  const [successLawyerName, setSuccessLawyerName] = useState<string | null>(
    null,
  );

  // ── 1. Check plan ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserPlan();
        if (!cancelled) {
          setIsVerdict(data.plan === "Verdict");
        }
      } catch {
        if (!cancelled) setIsVerdict(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, user, router]);

  // ── 2. Fetch lawyers once we know user is on Verdict ──────────────────────
  const fetchLawyers = useCallback(async (spec?: string) => {
    setLoading(true);
    setFetchError(null);
    try {
      const data = await getLawyers(spec);
      setLawyers(data);
    } catch (err: any) {
      setFetchError(err.message || "Failed to load lawyers.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isVerdict === true) {
      fetchLawyers(activeFilter ?? undefined);
    }
  }, [isVerdict, activeFilter, fetchLawyers]);

  // ── Handlers ───────────────────────────────────────────────────────────────
  const handleFilterClick = (spec: string) => {
    setActiveFilter((prev) => (prev === spec ? null : spec));
  };

  const handleContact = (lawyer: LawyerProfile) => {
    setContactLawyerTarget(lawyer);
  };

  const handleContactSuccess = () => {
    const name = contactLawyerTarget?.name ?? "";
    setContactLawyerTarget(null);
    setSuccessLawyerName(name);
  };

  // ── Loading / auth states ──────────────────────────────────────────────────
  if (!authReady || isVerdict === null) {
    return (
      <div className="min-h-screen font-sans">
        <Header />
        <main className="container mx-auto px-4 py-10 max-w-7xl flex items-center justify-center" style={{ minHeight: "calc(100vh - 140px)" }}>
          <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </main>
        <Footer />
      </div>
    );
  }

  // Non-Verdict upgrade gate
  if (isVerdict === false) {
    return (
      <div className="min-h-screen font-sans">
        <Header />
        <main className="container mx-auto px-4 py-10 max-w-7xl flex items-center justify-center" style={{ minHeight: "calc(100vh - 140px)" }}>
          <div className="w-full max-w-md ln-card rounded-2xl p-8 text-center fade-in">
            <div className="h-16 w-16 rounded-full bg-primary flex items-center justify-center mx-auto mb-4">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="h-8 w-8 text-white"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-semibold text-ink mb-2">
              Verdict Plan Required
            </h2>
            <p className="text-ink-subtle text-sm mb-6 leading-relaxed">
              The Lawyer Referral Network is an exclusive feature for{" "}
              <span className="text-primary font-medium">Verdict</span> plan
              subscribers. Upgrade to get curated lawyer assistance alongside
              your AI contract analysis.
            </p>
            <div className="flex gap-3 flex-col sm:flex-row">
              <Link href="/pricing" className="flex-1">
                <button className="w-full cursor-pointer inline-flex justify-center items-center px-4 py-2 text-sm ln-btn-primary">
                  View Pricing
                </button>
              </Link>
              <Link href="/dashboard" className="flex-1">
                <button className="w-full cursor-pointer px-4 py-2 text-sm ln-btn-secondary">
                  Back to Dashboard
                </button>
              </Link>
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  // ── Main directory UI ──────────────────────────────────────────────────────
  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-7xl">
        <div className="space-y-8 fade-in">
          {/* Back nav */}
          <div>
            <Link
              href="/dashboard"
              className="text-sm text-primary hover:text-primary-hover transition-colors"
            >
              ← Back to Dashboard
            </Link>
          </div>

          {/* Page header */}
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
              Lawyer Referral Network
            </h1>
            <p className="mt-3 text-base sm:text-lg text-ink-subtle max-w-2xl">
              Connect with vetted legal professionals who specialise in the same
              contract types our AI helps you analyse.
            </p>
            <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary bg-surface-2 border border-hairline px-3 py-1 rounded-full">
              <BadgeCheckIcon />
              Verdict Plan · Curated Lawyer Assistance
            </div>
          </div>

          {/* Specialization filter pills */}
          <div>
            <p className="text-xs text-ink-subtle uppercase tracking-widest mb-3">
              Filter by Specialization
            </p>
            <div className="flex flex-wrap gap-2">
              {ALL_SPECIALIZATIONS.map((spec) => (
                <button
                  key={spec}
                  onClick={() => handleFilterClick(spec)}
                  className={`text-md cursor-pointer font-medium px-3 py-1.5 rounded-full border transition-colors duration-200 ${
                    activeFilter === spec
                      ? "bg-primary border-primary text-white"
                      : "bg-surface-1 border-hairline text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  {spec}
                </button>
              ))}
              {activeFilter && (
                <button
                  onClick={() => setActiveFilter(null)}
                  className="text-md cursor-pointer font-medium px-3 py-1.5 rounded-full border border-danger/30 text-danger bg-danger/10 hover:bg-danger/20 transition-colors duration-200"
                >
                  Clear filter ×
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="h-10 w-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
            </div>
          ) : fetchError ? (
            <div className="ln-card rounded-xl p-8 text-center">
              <p className="text-danger text-sm mb-4">{fetchError}</p>
              <button
                onClick={() => fetchLawyers(activeFilter ?? undefined)}
                className="px-4 py-2 text-sm ln-btn-primary"
              >
                Retry
              </button>
            </div>
          ) : lawyers.length === 0 ? (
            <div className="ln-card rounded-xl p-12 text-center border-2 border-dashed border-hairline">
              <p className="text-ink-subtle text-sm">
                {activeFilter
                  ? `No lawyers found for "${activeFilter}".`
                  : "No lawyers in the directory yet."}
              </p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-subtle">
                {lawyers.length} lawyer{lawyers.length !== 1 ? "s" : ""}{" "}
                {activeFilter ? `specialising in ${activeFilter}` : "available"}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {lawyers.map((lawyer) => (
                  <LawyerCard
                    key={lawyer.id}
                    lawyer={lawyer}
                    onContact={handleContact}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </main>
      <Footer />

      {/* Contact modal */}
      {contactLawyerTarget && (
        <ContactModal
          lawyer={contactLawyerTarget}
          userEmail={user?.email ?? ""}
          onClose={() => setContactLawyerTarget(null)}
          onSuccess={handleContactSuccess}
        />
      )}

      {/* Success overlay */}
      {successLawyerName && (
        <SuccessOverlay
          lawyerName={successLawyerName}
          onDone={() => setSuccessLawyerName(null)}
        />
      )}
    </div>
  );
}
