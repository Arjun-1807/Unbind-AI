"use client";

import React, { useState } from "react";
import { registerLawyer } from "@/services/api";
import { CheckCircleIcon } from "./Icons";

const SPECIALIZATIONS = [
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

/**
 * The "join the referral network" path, for the secondary audience.
 *
 * Lives behind its own view rather than a top-level tab on the marketing
 * page: lawyers are a small fraction of arrivals, and asking every visitor
 * to classify themselves before the page has said what it does cost the
 * primary audience its hero.
 */
export default function LawyerRegistration({ onBack }: { onBack: () => void }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    city: "",
    experienceYears: "",
    phone: "",
    bio: "",
  });
  const [specs, setSpecs] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleField = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSpec = (spec: string, checked: boolean) =>
    setSpecs((prev) => (checked ? [...prev, spec] : prev.filter((s) => s !== spec)));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!terms) {
      setError("You must agree to the terms and conditions.");
      return;
    }
    if (specs.length === 0) {
      setError("Please select at least one specialization.");
      return;
    }

    setSubmitting(true);
    try {
      await registerLawyer({
        name: form.name,
        email: form.email,
        city: form.city,
        experienceYears: parseInt(form.experienceYears, 10) || 0,
        phone: form.phone || undefined,
        bio: form.bio,
        specializations: specs,
      });
      setSuccess(true);
      setForm({ name: "", email: "", city: "", experienceYears: "", phone: "", bio: "" });
      setSpecs([]);
      setTerms(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Registration failed. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <section className="pt-14 sm:pt-20">
        <div className="ln-shell ln-measure-md text-center">
          <button
            onClick={onBack}
            className="rise-in mb-8 inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-subtle transition-colors hover:text-ink"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m12 19-7-7 7-7" /><path d="M19 12H5" />
            </svg>
            Back to UnBind for contracts
          </button>

          <p className="ln-eyebrow rise-in" style={{ ["--i" as string]: 1 }}>
            Lawyer referral network
          </p>
          <h1
            className="rise-in mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl"
            style={{ ["--i" as string]: 2 }}
          >
            Grow your practice.
            <br />
            Connect with clients.
          </h1>
          <p
            className="rise-in mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-subtle"
            style={{ ["--i" as string]: 3 }}
          >
            Get matched with clients who have already had their contract analysed — so
            they arrive knowing which clause they need help with, and why.
          </p>
        </div>
      </section>

      <section className="ln-section">
        <div className="ln-shell ln-measure-sm">
          <div className="ln-card p-6 sm:p-8">
            {success ? (
              <div className="py-8 text-center">
                <CheckCircleIcon className="mx-auto mb-4 h-14 w-14 text-success" />
                <h2 className="mb-2 text-2xl font-semibold text-ink">
                  Application submitted
                </h2>
                <p className="mx-auto max-w-sm text-sm text-ink-subtle">
                  Our team will review your application and get back to you shortly.
                </p>
                <button
                  onClick={() => setSuccess(false)}
                  className="ln-btn-primary mt-6 cursor-pointer px-5 py-2 text-sm"
                >
                  Submit another
                </button>
              </div>
            ) : (
              <>
                <div className="mb-8">
                  <h2 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
                    Register your profile
                  </h2>
                  <p className="mt-2 text-sm text-ink-subtle">
                    Once reviewed, your profile is listed in the directory that Verdict
                    plan users search.
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Field label="Full name" htmlFor="lawyer-name">
                      <input
                        type="text"
                        id="lawyer-name"
                        name="name"
                        required
                        value={form.name}
                        onChange={handleField}
                        className="ln-input w-full px-4 py-2"
                        placeholder="Enter your full name"
                      />
                    </Field>
                    <Field label="Email address" htmlFor="lawyer-email">
                      <input
                        type="email"
                        id="lawyer-email"
                        name="email"
                        required
                        value={form.email}
                        onChange={handleField}
                        className="ln-input w-full px-4 py-2"
                        placeholder="Enter your email"
                      />
                    </Field>
                  </div>

                  <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                    <Field label="City" htmlFor="lawyer-city">
                      <input
                        type="text"
                        id="lawyer-city"
                        name="city"
                        required
                        value={form.city}
                        onChange={handleField}
                        className="ln-input w-full px-4 py-2"
                        placeholder="Enter your city"
                      />
                    </Field>
                    <Field label="Years of experience" htmlFor="lawyer-experience">
                      <input
                        type="number"
                        id="lawyer-experience"
                        name="experienceYears"
                        required
                        min="0"
                        value={form.experienceYears}
                        onChange={handleField}
                        className="ln-input w-full px-4 py-2"
                        placeholder="Enter years of experience"
                      />
                    </Field>
                  </div>

                  <Field label="Phone number (optional)" htmlFor="lawyer-phone">
                    <input
                      type="tel"
                      id="lawyer-phone"
                      name="phone"
                      value={form.phone}
                      onChange={handleField}
                      className="ln-input w-full px-4 py-2"
                      placeholder="Enter your phone number"
                    />
                  </Field>

                  <fieldset>
                    <legend className="mb-2 block text-sm font-medium text-ink-muted">
                      Specializations
                    </legend>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
                      {SPECIALIZATIONS.map((spec) => (
                        <label
                          key={spec}
                          className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted"
                        >
                          <input
                            type="checkbox"
                            className="rounded border-hairline bg-surface-2 text-primary focus:ring-primary-focus"
                            value={spec}
                            checked={specs.includes(spec)}
                            onChange={(e) => handleSpec(spec, e.target.checked)}
                          />
                          <span>{spec}</span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <Field label="Professional bio" htmlFor="lawyer-bio">
                    <textarea
                      id="lawyer-bio"
                      name="bio"
                      required
                      rows={4}
                      value={form.bio}
                      onChange={handleField}
                      className="ln-input w-full resize-none px-4 py-2"
                      placeholder="Tell us about your experience, expertise, and what makes you unique as a legal professional…"
                    />
                  </Field>

                  <div className="flex items-start gap-2">
                    <input
                      id="lawyer-terms"
                      type="checkbox"
                      checked={terms}
                      onChange={(e) => setTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-hairline bg-surface-2 text-primary focus:ring-primary-focus"
                    />
                    <label htmlFor="lawyer-terms" className="text-sm text-ink-muted">
                      I agree to the terms and conditions and consent to having my
                      information shared with potential clients.
                    </label>
                  </div>

                  {error && (
                    <p
                      role="alert"
                      className="rounded-md border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger"
                    >
                      {error}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="ln-btn-primary inline-flex w-full cursor-pointer justify-center px-6 py-3"
                  >
                    {submitting ? "Submitting…" : "Register as a lawyer"}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </section>
    </>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children}
    </div>
  );
}
