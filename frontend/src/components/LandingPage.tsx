"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  LogoIcon,
  SparklesIcon,
  ShieldCheckIcon,
  FileTextIcon,
  DownloadIcon,
  CalendarIcon,
  AlertTriangleIcon,
} from "./Icons";
import ScreenshotFrame from "./ScreenshotFrame";
import HeroProductMockup from "./HeroProductMockup";
import { registerLawyer } from "@/services/api";

const TerminalIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

const TargetIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const CheckIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const ArrowRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

const ChevronDownIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

const LandingPage: React.FC = () => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'users' | 'lawyers'>('users');

  // ── Lawyer registration form state ───────────────────────────────────────
  const [lawyerForm, setLawyerForm] = useState({
    name: "",
    email: "",
    city: "",
    experienceYears: "",
    phone: "",
    bio: "",
  });
  const [lawyerSpecs, setLawyerSpecs] = useState<string[]>([]);
  const [lawyerTerms, setLawyerTerms] = useState(false);
  const [lawyerSubmitting, setLawyerSubmitting] = useState(false);
  const [lawyerSuccess, setLawyerSuccess] = useState(false);
  const [lawyerError, setLawyerError] = useState<string | null>(null);

  const handleLawyerField = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setLawyerForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSpecChange = (spec: string, checked: boolean) => {
    setLawyerSpecs((prev) =>
      checked ? [...prev, spec] : prev.filter((s) => s !== spec)
    );
  };

  const handleLawyerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLawyerError(null);

    if (!lawyerTerms) {
      setLawyerError("You must agree to the terms and conditions.");
      return;
    }
    if (lawyerSpecs.length === 0) {
      setLawyerError("Please select at least one specialization.");
      return;
    }

    setLawyerSubmitting(true);
    try {
      await registerLawyer({
        name: lawyerForm.name,
        email: lawyerForm.email,
        city: lawyerForm.city,
        experienceYears: parseInt(lawyerForm.experienceYears, 10) || 0,
        phone: lawyerForm.phone || undefined,
        bio: lawyerForm.bio,
        specializations: lawyerSpecs,
      });
      setLawyerSuccess(true);
      setLawyerForm({ name: "", email: "", city: "", experienceYears: "", phone: "", bio: "" });
      setLawyerSpecs([]);
      setLawyerTerms(false);
    } catch (err: any) {
      setLawyerError(err.message || "Registration failed. Please try again.");
    } finally {
      setLawyerSubmitting(false);
    }
  };



  const handleCopy = () => {
    navigator.clipboard.writeText("npm install -g unbindai");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full fade-in">

      {/* Tab Switcher */}
      <div className="flex justify-center pt-8 pb-2 px-4">
        <div className="inline-flex max-w-full items-center gap-1 p-1 rounded-full bg-surface-1 border border-hairline">
          <button
            id="tab-analyze"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'users' ? 'bg-surface-2 text-ink' : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Analyze Contracts
          </button>
          <button
            id="tab-lawyers"
            onClick={() => setActiveTab('lawyers')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-1.5 rounded-full text-xs sm:text-sm font-medium transition-colors duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'lawyers' ? 'bg-surface-2 text-ink' : 'text-ink-subtle hover:text-ink-muted'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            For Legal Professionals
          </button>
        </div>
      </div>

      {/* User Tab */}
      {activeTab === 'users' && (<>
      {/* Hero — Linear-style: near-black canvas, lavender accent, product UI as protagonist */}
      <section
        className="relative overflow-hidden rounded-3xl pt-16 sm:pt-24 lg:pt-28 pb-12 sm:pb-16"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -10%, rgba(94,106,210,0.10), transparent 60%), var(--ln-canvas)",
          boxShadow: "0 0 0 1px var(--ln-hairline)",
        }}
      >
        <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            {/* Eyebrow badge */}
            <div
              className="mb-7 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium"
              style={{
                background: "var(--ln-surface-1)",
                border: "1px solid var(--ln-hairline)",
                color: "var(--ln-ink-muted)",
                letterSpacing: "0.4px",
              }}
            >
              <SparklesIcon className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--ln-primary-hover)" }} />
              AI-Powered Contract Intelligence
            </div>

            <h1
              className="mx-auto max-w-3xl font-semibold"
              style={{
                color: "var(--ln-ink)",
                fontSize: "clamp(2.5rem, 6vw, 5rem)",
                lineHeight: 1.05,
                letterSpacing: "-0.03em",
              }}
            >
              Contracts decoded.
              <br />
              Risks revealed.
            </h1>

            <p
              className="mx-auto mt-6 max-w-2xl"
              style={{
                color: "var(--ln-ink-subtle)",
                fontSize: "clamp(1rem, 2vw, 1.25rem)",
                lineHeight: 1.5,
                letterSpacing: "-0.1px",
              }}
            >
              Upload any legal contract and get instant clause-by-clause analysis, risk scoring,
              negotiation suggestions, and deadline tracking — in plain English.
            </p>

            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <button
                onClick={() => router.push("/signup")}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium text-white transition-colors cursor-pointer"
                style={{ background: "var(--ln-primary)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ln-primary-hover)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ln-primary)"; }}
              >
                Start Analysing Free
                <ArrowRightIcon className="ml-2 h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/login")}
                className="w-full sm:w-auto inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-sm font-medium transition-colors cursor-pointer"
                style={{
                  background: "var(--ln-surface-1)",
                  border: "1px solid var(--ln-hairline)",
                  color: "var(--ln-ink)",
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ln-surface-2)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--ln-surface-1)"; }}
              >
                Sign In
              </button>
            </div>
          </div>

          {/* Product UI mockup — the protagonist, rendered from live components */}
          <div className="mt-14 sm:mt-16">
            <HeroProductMockup />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-semibold text-ink tracking-tight">
              Everything you need to understand any contract
            </h2>
            <p className="mt-4 text-base sm:text-lg text-ink-subtle max-w-2xl mx-auto">
              From risk analysis to deadline tracking — UnBind gives you complete contract intelligence in minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <AlertTriangleIcon className="h-6 w-6" />,
                title: "Risk Analysis",
                desc: "Clause-by-clause risk scoring with a visual risk meter. See what's dangerous before you sign.",
              },
              {
                icon: <ShieldCheckIcon className="h-6 w-6" />,
                title: "Negotiation Helper",
                desc: "AI-generated alternative clauses with keep, AI-suggested, or custom options for every risky term.",
              },
              {
                icon: <BookOpenIcon className="h-6 w-6" />,
                title: "Key Terms Glossary",
                desc: "Legal jargon translated to plain English. Understand indemnification, force majeure, and more.",
              },
              {
                icon: <CalendarIcon className="h-6 w-6" />,
                title: "Key Dates & Deadlines",
                desc: "Automatic deadline extraction with ICS calendar export. Never miss a renewal or notice period.",
              },
              {
                icon: <TargetIcon className="h-6 w-6" />,
                title: "Impact Simulator",
                desc: '"What if I…?" scenario testing against your contract. See how changes ripple through terms.',
              },
              {
                icon: <FileTextIcon className="h-6 w-6" />,
                title: "Document View",
                desc: "Side-by-side contract view with interactive clause highlighting linked to the analysis.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group ln-card p-6 hover:border-hairline-strong transition-colors duration-200"
              >
                <div className="text-primary mb-4">{feature.icon}</div>
                <h3 className="text-lg font-medium text-ink mb-2">
                  {feature.title}
                </h3>
                <p className="text-ink-subtle text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLI Section */}
      <section className="py-12 sm:py-24 border-t border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-1 border border-hairline text-ink-muted text-sm font-medium mb-6">
                <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                CLI Tool · Exclusive to Verdict
              </div>
              <h2 className="text-2xl sm:text-4xl font-semibold text-ink tracking-tight">
                Analyze contracts from
                <br />
                your terminal
              </h2>
              <p className="mt-4 text-lg text-ink-subtle leading-relaxed">
                No browser needed. Install the CLI and get a full interactive REPL
                for contract analysis right in your terminal.
              </p>
              <p className="mt-2 text-sm text-primary">
                Available exclusively for Verdict plan users.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Upload and analyze PDFs from the command line",
                  "Interactive REPL with rich formatted output",
                  "Same powerful AI analysis as the web app",
                  "Secure auth with persistent session tokens",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckIcon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                    <span className="text-ink-muted text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Terminal mockup */}
            <div className="rounded-xl border border-hairline bg-surface-1 overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-hairline bg-canvas">
                <div className="w-3 h-3 rounded-full bg-hairline-tertiary" />
                <div className="w-3 h-3 rounded-full bg-hairline-tertiary" />
                <div className="w-3 h-3 rounded-full bg-hairline-tertiary" />
                <span className="ml-3 text-xs text-ink-subtle font-mono">terminal</span>
              </div>
              <div className="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
                <div className="text-ink-muted">
                  <span className="text-primary">$</span> npm install -g unbindai
                </div>
                <div className="text-ink-subtle mt-1">added 42 packages in 3s</div>
                <div className="text-ink-muted mt-3">
                  <span className="text-primary">$</span> unbind contract.pdf
                </div>
                <div className="mt-2 text-ink-subtle whitespace-nowrap">
                  <div className="text-primary">╭──────────────────────────────────────╮</div>
                  <div className="text-primary">│ <span className="text-ink font-semibold">UnBindAI CLI</span>                        │</div>
                  <div className="text-primary">│ <span className="text-ink-subtle">AI-powered contract analysis</span>        │</div>
                  <div className="text-primary">╰──────────────────────────────────────╯</div>
                </div>
                <div className="mt-2">
                  <span className="text-warning">⚠</span>
                  <span className="text-ink-muted"> Analyzing contract.pdf...</span>
                </div>
                <div className="mt-1">
                  <span className="text-success">✓</span>
                  <span className="text-ink-muted"> Found 12 clauses · Risk Score: </span>
                  <span className="text-danger font-semibold">7.2/10</span>
                </div>
                <div className="mt-2 text-ink-muted">
                  <span className="text-primary">unbind&gt;</span> show risks
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 sm:py-24 border-t border-hairline">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-semibold text-ink tracking-tight">How it works</h2>
            <p className="mt-4 text-base sm:text-lg text-ink-subtle">Three steps to contract clarity</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload your contract",
                desc: "Drag and drop any PDF contract. We support NDAs, employment agreements, SaaS terms, and more.",
                image: "/upload.png",
                imageAlt: "Upload contract interface preview",
                frameTitle: "Upload Contract",
              },
              {
                step: "02",
                title: "AI analyzes every clause",
                desc: "Our AI reads each clause, scores risk levels, extracts key dates, and generates plain-English summaries.",
                image: "/clause.png",
                imageAlt: "Clause analysis preview",
                frameTitle: "Clause Analysis",
              },
              {
                step: "03",
                title: "Review and negotiate",
                desc: "Explore risks, get alternative clauses, simulate scenarios, and export a full report as PDF.",
                image: "/nego.png",
                imageAlt: "Negotiation helper preview",
                frameTitle: "Negotiation Helper",
              },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-semibold text-surface-4 mb-4" style={{ color: "var(--ln-hairline-tertiary)" }}>{step.step}</div>
                <div className="mb-6 flex justify-center">
                  <ScreenshotFrame
                    src={step.image}
                    alt={step.imageAlt}
                    title={step.frameTitle}
                    showControls={false}
                    maxWidth={320}
                    contentClassName="aspect-4/3 overflow-hidden"
                    imageClassName="h-full object-cover object-top"
                  />
                </div>
                <h3 className="text-lg font-medium text-ink mb-2">{step.title}</h3>
                <p className="text-ink-subtle text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="py-12 sm:py-24 border-t border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-white">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base sm:text-lg text-ink-subtle max-w-2xl mx-auto">
              Start free and upgrade when you need more. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Brief */}
            <div className="ln-card p-6 flex flex-col">
              <h3 className="text-xl font-semibold text-ink mb-1">Brief</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-semibold text-ink">₹100</span>
                <span className="text-ink-subtle text-sm">/month</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster analysis",
                  "3 analyses per day",
                  "Valid for 1 month",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-ink-muted text-sm">
                    <CheckIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 cursor-pointer ln-btn-secondary"
              >
                Get Brief
              </button>
            </div>

            {/* Motion — Popular (surface lift, per Linear featured spec) */}
            <div className="ln-card-raised p-6 flex flex-col relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-white px-3 py-0.5 rounded-full text-xs font-medium">
                      POPULAR
                    </span>
              </div>
              <h3 className="text-xl font-semibold text-ink mb-1">Motion</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-semibold text-ink">₹450</span>
                <span className="text-ink-subtle text-sm">/3 months</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster analysis",
                  "Deeper analysis",
                  "5 analyses per day",
                  "Valid for 3 months",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-ink-muted text-sm">
                    <CheckIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 cursor-pointer ln-btn-primary"
              >
                Get Motion
              </button>
            </div>

            {/* Verdict */}
            <div className="ln-card p-6 flex flex-col relative">
              <h3 className="text-xl font-semibold text-ink mb-1">Verdict</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-semibold text-ink">₹1500</span>
                <span className="text-ink-subtle text-sm">/lifetime</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster & deeper analysis",
                  "Unlimited analyses",
                  "Curated lawyer assistance",
                  "Lifetime access",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-ink-muted text-sm">
                    <CheckIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-sm">
                  <TerminalIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-primary font-medium">CLI tool access (exclusive)</span>
                </li>
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 cursor-pointer ln-btn-secondary"
              >
                Get Verdict
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Extra features row */}
      <section className="py-12 sm:py-24 border-t border-hairline">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Export card */}
            <div className="ln-card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <DownloadIcon className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-medium text-ink mb-2">PDF Export & Modified Contracts</h3>
                <p className="text-ink-subtle leading-relaxed">
                  Download your full analysis as a formatted PDF report. Export modified contracts
                  with your negotiated clause changes applied — ready to send to the other party.
                </p>
              </div>
              <div className="mt-6 flex justify-center">
                <ScreenshotFrame
                  src="/export.png"
                  alt="PDF export report preview"
                  title="PDF Export"
                  showControls={false}
                  maxWidth={520}
                  contentClassName="aspect-2/1 overflow-hidden"
                  imageClassName="h-full object-cover object-top"
                />
              </div>
            </div>

            {/* Dashboard card */}
            <div className="ln-card p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <LogoIcon className="h-8 w-8 text-primary mb-4" />
                <h3 className="text-xl font-medium text-ink mb-2">Dashboard & History</h3>
                <p className="text-ink-subtle leading-relaxed">
                  All your past analyses in one place. Re-visit any contract, compare risk scores
                  over time, and manage your account with secure JWT-based authentication.
                </p>
              </div>
              <div className="mt-6 flex justify-center">
                <ScreenshotFrame
                  src="/dashboard.png"
                  alt="Dashboard history preview"
                  title="Dashboard"
                  showControls={false}
                  maxWidth={520}
                  contentClassName="aspect-2/1 overflow-hidden"
                  imageClassName="h-full object-cover object-top"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-12 sm:py-24 border-t border-hairline">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-4xl font-semibold text-ink tracking-tight">
            Let justice be done though the heavens fall
          </h2>
          <p className="mt-4 text-base sm:text-lg text-ink-subtle max-w-xl mx-auto">
            Get started free — no credit card required. Analyse your first contract in under two minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push("/signup")}
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center px-6 py-2.5 ln-btn-primary"
            >
              Get Started Free
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center px-6 py-2.5 ln-btn-secondary"
            >
              Sign In
            </button>
          </div>

          {/* CLI reminder */}
          <div className="mt-8">
            <p className="text-ink-subtle text-sm mb-2">Or install the CLI</p>
            <div
              onClick={handleCopy}
              className="inline-flex max-w-full items-center gap-2 px-4 py-2 rounded-md bg-surface-1 border border-hairline hover:border-hairline-strong cursor-pointer transition-colors duration-200"
            >
              <span className="text-primary font-mono text-sm">$</span>
              <code className="truncate text-ink-muted font-mono text-sm">npm install -g unbindai</code>
              <span className="text-ink-subtle hover:text-primary transition-colors">
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-success" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
              </span>
            </div>
          </div>
        </div>
      </section>
      </>)}

      {/* Lawyer Tab */}
      {activeTab === 'lawyers' && (<>
      {/* Lawyer Hero */}
      <section className="pt-12 sm:pt-16 lg:pt-20 pb-10 relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-surface-1 border border-hairline text-ink-muted text-sm font-medium mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-primary"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Lawyer Referral Network · Join Now
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-semibold tracking-tight text-ink leading-[1.05]">
            Grow your practice.
            <br />
            Connect with clients.
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-ink-subtle max-w-2xl mx-auto leading-relaxed">
            Join our curated Lawyer Referral Network and get matched with clients who need your specific legal expertise — powered by UnBind AI contract analysis.
          </p>
          <div className="mt-8 flex justify-center">
            <div className="flex flex-col items-center text-ink-tertiary animate-bounce">
              <ChevronDownIcon className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section className="py-12 sm:py-16">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-semibold text-ink tracking-tight">
              Register your profile
            </h2>
            <p className="mt-3 text-ink-subtle max-w-xl mx-auto">
              Fill in your details below. Once reviewed, your profile will be listed in the directory for Verdict plan users to find you.
            </p>
          </div>

          <div className="max-w-3xl mx-auto ln-card p-6 sm:p-8">
            {lawyerSuccess ? (
              <div className="text-center py-8">
                <div className="flex justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-14 w-14 text-success">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-semibold text-ink mb-2">Application Submitted!</h3>
                <p className="text-ink-subtle text-sm max-w-sm mx-auto">
                  Thank you for registering. Our team will review your application and get back to you shortly.
                </p>
                <button
                  onClick={() => setLawyerSuccess(false)}
                  className="mt-6 px-5 py-2 text-sm ln-btn-primary"
                >
                  Submit Another
                </button>
              </div>
            ) : (
            <form onSubmit={handleLawyerSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="lawyer-name" className="block text-sm font-medium text-ink-muted mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="lawyer-name"
                    name="name"
                    required
                    value={lawyerForm.name}
                    onChange={handleLawyerField}
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter your full name"
                  />
                </div>
                <div>
                  <label htmlFor="lawyer-email" className="block text-sm font-medium text-ink-muted mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="lawyer-email"
                    name="email"
                    required
                    value={lawyerForm.email}
                    onChange={handleLawyerField}
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="lawyer-city" className="block text-sm font-medium text-ink-muted mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    id="lawyer-city"
                    name="city"
                    required
                    value={lawyerForm.city}
                    onChange={handleLawyerField}
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter your city"
                  />
                </div>
                <div>
                  <label htmlFor="lawyer-experience" className="block text-sm font-medium text-ink-muted mb-1">
                    Years of Experience
                  </label>
                  <input
                    type="number"
                    id="lawyer-experience"
                    name="experienceYears"
                    required
                    min="0"
                    value={lawyerForm.experienceYears}
                    onChange={handleLawyerField}
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter years of experience"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lawyer-phone" className="block text-sm font-medium text-ink-muted mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  id="lawyer-phone"
                  name="phone"
                  value={lawyerForm.phone}
                  onChange={handleLawyerField}
                  className="ln-input w-full px-4 py-2"
                  placeholder="Enter your phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-ink-muted mb-1">
                  Specializations
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                  {[
                    "Employment",
                    "Real Estate",
                    "NDA",
                    "SaaS",
                    "Corporate",
                    "Technology",
                    "Compliance",
                    "Construction",
                    "Intellectual Property",
                    "M&A"
                  ].map((spec) => (
                    <label key={spec} className="flex items-center gap-2 text-sm text-ink-muted">
                      <input
                        type="checkbox"
                        className="rounded bg-surface-2 border-hairline text-primary focus:ring-primary-focus"
                        value={spec}
                        checked={lawyerSpecs.includes(spec)}
                        onChange={(e) => handleSpecChange(spec, e.target.checked)}
                      />
                      <span>{spec}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="lawyer-bio" className="block text-sm font-medium text-ink-muted mb-1">
                  Professional Bio
                </label>
                <textarea
                  id="lawyer-bio"
                  name="bio"
                  required
                  rows={4}
                  value={lawyerForm.bio}
                  onChange={handleLawyerField}
                  className="ln-input w-full px-4 py-2 resize-none"
                  placeholder="Tell us about your experience, expertise, and what makes you unique as a legal professional..."
                />
              </div>

              <div className="flex items-center">
                <input
                  id="lawyer-terms"
                  type="checkbox"
                  checked={lawyerTerms}
                  onChange={(e) => setLawyerTerms(e.target.checked)}
                  className="h-4 w-4 rounded bg-surface-2 border-hairline text-primary focus:ring-primary-focus"
                />
                <label htmlFor="lawyer-terms" className="ml-2 block text-sm text-ink-muted">
                  I agree to the terms and conditions and consent to having my information shared with potential clients.
                </label>
              </div>

              {lawyerError && (
                <p className="text-sm text-danger bg-danger/10 border border-danger/20 px-3 py-2 rounded-md">
                  {lawyerError}
                </p>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={lawyerSubmitting}
                  className="w-full inline-flex justify-center items-center px-6 py-3 ln-btn-primary"
                >
                  {lawyerSubmitting ? "Submitting…" : "Register as a Lawyer"}
                </button>
              </div>
            </form>
            )}
          </div>
        </div>
      </section>
      </>)}

      {/* Footer */}

    </div>
  );
};

export default LandingPage;
