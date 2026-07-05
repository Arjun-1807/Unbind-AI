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
import { Herr_Von_Muellerhoff } from "next/font/google";
import ScreenshotFrame from "./ScreenshotFrame";
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
        <div className="inline-flex max-w-full items-center gap-1 p-1 rounded-xl bg-gray-900/80 border border-gray-700/60 shadow-lg shadow-black/20 backdrop-blur-sm">
          <button
            id="tab-analyze"
            onClick={() => setActiveTab('users')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'users' ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            Analyze Contracts
          </button>
          <button
            id="tab-lawyers"
            onClick={() => setActiveTab('lawyers')}
            className={`inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-5 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer whitespace-nowrap ${
              activeTab === 'lawyers' ? 'bg-purple-600 text-white shadow-md shadow-purple-500/30' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
            }`}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            For Legal Professionals
          </button>
        </div>
      </div>

      {/* User Tab */}
      {activeTab === 'users' && (<>
      {/* Hero */}
      <section className="pt-12 sm:pt-16 lg:pt-24 pb-16 sm:pb-20 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-150 bg-indigo-500/5 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8">
              <SparklesIcon className="h-3.5 w-3.5 shrink-0" />
              AI-Powered Contract Intelligence
            </div>

            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
              Contracts decoded.
              <br />
              <span className="bg-linear-to-r from-indigo-400 via-indigo-300 to-purple-400 bg-clip-text text-transparent">
                Risks revealed.
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Upload any legal contract and get instant clause-by-clause analysis, risk scoring,
              negotiation suggestions, and deadline tracking — in plain English.
            </p>

            {/* Install command */}
            <div className="mt-10 flex flex-col items-center gap-4">
              <div className="inline-flex max-w-full items-center gap-2">
                <div
                  onClick={handleCopy}
                  className="group cursor-pointer inline-flex min-w-0 items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 rounded-lg bg-gray-900/80 border border-gray-700/80 hover:border-indigo-500/50 transition-all duration-200"
                >
                  <span className="text-green-400 font-mono text-sm select-none">$</span>
                  <code className="truncate text-gray-200 font-mono text-sm sm:text-base">
                    npm install -g unbindai
                  </code>
                  <span className="shrink-0 text-gray-500 group-hover:text-indigo-400 transition-colors">
                    {copied ? (
                      <CheckIcon className="h-4 w-4 text-green-400" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </span>
                </div>
                <div className="relative shrink-0 group/info">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 hover:text-indigo-400 cursor-help transition-colors">
                    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" />
                  </svg>
                  <div
                    className="absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 translate-y-1 rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-xs text-gray-300 opacity-0 shadow-xl shadow-black/30 transition-all duration-200 ease-out pointer-events-auto group-hover/info:opacity-100 group-hover/info:translate-y-0 hover:opacity-100 hover:translate-y-0"
                    role="tooltip"
                  >
                    {/* <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
                      CLI access
                    </p> */}
                    <ul className="list-disc space-y-1 pl-4 whitespace-normal">
                      <li>Available only for Verdict plan users</li>
                      <li>
                        Node.js v18+ required.{' '}
                        <a
                          href="https://nodejs.org/en"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-indigo-400 hover:text-indigo-300"
                        >
                          Download
                        </a>
                      </li>
                    </ul>
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => router.push("/signup")}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 transition-all duration-200 cursor-pointer"
                >
                  Start Analyzing Free
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </button>
                <button
                  onClick={() => router.push("/login")}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 font-semibold text-gray-300 bg-white/5 border border-gray-700 rounded-lg hover:bg-white/10 hover:border-gray-600 transition-all duration-200 cursor-pointer"
                >
                  Sign In
                </button>
              </div>
            </div>

            <div className="mt-10 flex justify-center">
              <div className="flex flex-col items-center text-gray-500 animate-float-y" aria-hidden="true">
                <ChevronDownIcon className="h-5 w-5" />
                <ChevronDownIcon className="-mt-2 h-5 w-5 opacity-70" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Screenshot Placeholder */}
      <section className="pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center">
            <ScreenshotFrame
              src="/analysis.png"
              alt="Risk analysis dashboard preview"
              title="Risk Analysis Dashboard"
              showUrlBar
              url="unbindai.vercel.app/analysis"
              maxWidth={1080}
              priority
            />
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-12 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-white">
              Everything you need to understand any contract
            </h2>
            <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
              From risk analysis to deadline tracking — UnBind gives you complete contract intelligence in minutes.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: <AlertTriangleIcon className="h-6 w-6" />,
                color: "text-red-400",
                title: "Risk Analysis",
                desc: "Clause-by-clause risk scoring with a visual risk meter. See what's dangerous before you sign.",
              },
              {
                icon: <ShieldCheckIcon className="h-6 w-6" />,
                color: "text-green-400",
                title: "Negotiation Helper",
                desc: "AI-generated alternative clauses with keep, AI-suggested, or custom options for every risky term.",
              },
              {
                icon: <BookOpenIcon className="h-6 w-6" />,
                color: "text-blue-400",
                title: "Key Terms Glossary",
                desc: "Legal jargon translated to plain English. Understand indemnification, force majeure, and more.",
              },
              {
                icon: <CalendarIcon className="h-6 w-6" />,
                color: "text-yellow-400",
                title: "Key Dates & Deadlines",
                desc: "Automatic deadline extraction with ICS calendar export. Never miss a renewal or notice period.",
              },
              {
                icon: <TargetIcon className="h-6 w-6" />,
                color: "text-purple-400",
                title: "Impact Simulator",
                desc: '"What if I…?" scenario testing against your contract. See how changes ripple through terms.',
              },
              {
                icon: <FileTextIcon className="h-6 w-6" />,
                color: "text-indigo-400",
                title: "Document View",
                desc: "Side-by-side contract view with interactive clause highlighting linked to the analysis.",
              },
            ].map((feature, i) => (
              <div
                key={i}
                className="group glass-card p-6 rounded-xl hover:border-indigo-500/40 transition-all duration-300"
              >
                <div className={`${feature.color} mb-4`}>{feature.icon}</div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  {feature.title}
                </h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {feature.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CLI Section */}
      <section className="py-12 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-6">
                <TerminalIcon className="h-3.5 w-3.5 shrink-0" />
                CLI Tool · Exclusive to Verdict
              </div>
              <h2 className="text-2xl sm:text-4xl font-bold text-white">
                Analyze contracts from
                <br />
                your terminal
              </h2>
              <p className="mt-4 text-lg text-gray-400 leading-relaxed">
                No browser needed. Install the CLI and get a full interactive REPL
                for contract analysis right in your terminal.
              </p>
              <p className="mt-2 text-sm text-indigo-400">
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
                    <CheckIcon className="h-5 w-5 text-green-400 mt-0.5 shrink-0" />
                    <span className="text-gray-300 text-sm">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Terminal mockup */}
            <div className="rounded-xl border border-gray-700/50 bg-gray-900/80 overflow-hidden shadow-2xl">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50 bg-gray-900">
                <div className="w-3 h-3 rounded-full bg-red-500/70" />
                <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                <div className="w-3 h-3 rounded-full bg-green-500/70" />
                <span className="ml-3 text-xs text-gray-500 font-mono">terminal</span>
              </div>
              <div className="p-5 font-mono text-xs sm:text-sm leading-relaxed overflow-x-auto">
                <div className="text-gray-400">
                  <span className="text-green-400">$</span> npm install -g unbindai
                </div>
                <div className="text-gray-500 mt-1">added 42 packages in 3s</div>
                <div className="text-gray-400 mt-3">
                  <span className="text-green-400">$</span> unbind contract.pdf
                </div>
                <div className="mt-2 text-gray-500 whitespace-nowrap">
                  <div className="text-indigo-400">╭──────────────────────────────────────╮</div>
                  <div className="text-indigo-400">│ <span className="text-white font-bold">UnBindAI CLI</span>                        │</div>
                  <div className="text-indigo-400">│ <span className="text-gray-400">AI-powered contract analysis</span>        │</div>
                  <div className="text-indigo-400">╰──────────────────────────────────────╯</div>
                </div>
                <div className="mt-2">
                  <span className="text-yellow-400">⚠</span>
                  <span className="text-gray-300"> Analyzing contract.pdf...</span>
                </div>
                <div className="mt-1">
                  <span className="text-green-400">✓</span>
                  <span className="text-gray-300"> Found 12 clauses · Risk Score: </span>
                  <span className="text-red-400 font-bold">7.2/10</span>
                </div>
                <div className="mt-2 text-gray-400">
                  <span className="text-indigo-400">unbind&gt;</span> show risks
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-12 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-white">How it works</h2>
            <p className="mt-4 text-base sm:text-lg text-gray-400">Three steps to contract clarity</p>
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
                <div className="text-5xl font-extrabold text-indigo-500/20 mb-4">{step.step}</div>
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
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="py-12 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12 sm:mb-16">
            <h2 className="text-2xl sm:text-4xl font-bold text-white">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-2xl mx-auto">
              Start free and upgrade when you need more. Cancel anytime.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {/* Brief */}
            <div className="glass-card rounded-2xl p-6 flex flex-col">
              <h3 className="text-xl font-bold text-white mb-1">Brief</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-white">₹100</span>
                <span className="text-gray-500 text-sm">/month</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster analysis",
                  "3 analyses per day",
                  "Valid for 1 month",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                    <CheckIcon className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 rounded-lg cursor-pointer font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Get Brief
              </button>
            </div>

            {/* Motion — Popular */}
            <div className="glass-card rounded-2xl p-6 flex flex-col relative border-2 border-indigo-500/60!">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                      POPULAR
                    </span>
              </div>
              <h3 className="text-xl font-bold text-white mb-1">Motion</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-white">₹450</span>
                <span className="text-gray-500 text-sm">/3 months</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster analysis",
                  "Deeper analysis",
                  "5 analyses per day",
                  "Valid for 3 months",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                    <CheckIcon className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 rounded-lg cursor-pointer font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Get Motion
              </button>
            </div>

            {/* Verdict */}
            <div className="glass-card rounded-2xl p-6 flex flex-col relative">
              <h3 className="text-xl font-bold text-white mb-1">Verdict</h3>
              <div className="flex items-baseline gap-1 mb-4">
                <span className="text-3xl font-bold text-white">₹1500</span>
                <span className="text-gray-500 text-sm">/lifetime</span>
              </div>
              <ul className="space-y-2.5 mb-8 grow">
                {[
                  "Top-end AI models",
                  "Faster & deeper analysis",
                  "Unlimited analyses",
                  "Curated lawyer assistance",
                  "Lifetime access",
                ].map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-gray-300 text-sm">
                    <CheckIcon className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                    {item}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-sm">
                  <TerminalIcon className="h-4 w-4 text-indigo-400 mt-0.5 shrink-0" />
                  <span className="text-indigo-300 font-semibold">CLI tool access (exclusive)</span>
                </li>
              </ul>
              <button
                onClick={() => router.push("/login")}
                className="w-full py-2.5 rounded-lg cursor-pointer font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
              >
                Get Verdict
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Extra features row */}
      <section className="py-12 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Export card */}
            <div className="glass-card rounded-xl p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <DownloadIcon className="h-8 w-8 text-indigo-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">PDF Export & Modified Contracts</h3>
                <p className="text-gray-400 leading-relaxed">
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
            <div className="glass-card rounded-xl p-6 sm:p-8 flex flex-col justify-between">
              <div>
                <LogoIcon className="h-8 w-8 text-indigo-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Dashboard & History</h3>
                <p className="text-gray-400 leading-relaxed">
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
      <section className="py-12 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold text-white">
            Stop signing contracts you don&apos;t fully understand
          </h2>
          <p className="mt-4 text-base sm:text-lg text-gray-400 max-w-xl mx-auto">
            Get started free — no credit card required. Analyze your first contract in under two minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push("/signup")}
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center px-8 py-3.5 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 transition-all duration-200"
            >
              Get Started Free
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full sm:w-auto cursor-pointer inline-flex items-center justify-center px-8 py-3.5 font-semibold text-gray-300 bg-white/5 border border-gray-700 rounded-lg hover:bg-white/10 hover:border-gray-600 transition-all duration-200"
            >
              Sign In
            </button>
          </div>

          {/* CLI reminder */}
          <div className="mt-8">
            <p className="text-gray-500 text-sm mb-2">Or install the CLI</p>
            <div
              onClick={handleCopy}
              className="inline-flex max-w-full items-center gap-2 px-4 py-2 rounded-md bg-gray-900/80 border border-gray-700/80 hover:border-indigo-500/50 cursor-pointer transition-all duration-200"
            >
              <span className="text-green-400 font-mono text-sm">$</span>
              <code className="truncate text-gray-300 font-mono text-sm">npm install -g unbindai</code>
              <span className="text-gray-500 hover:text-indigo-400 transition-colors">
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-green-400" />
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
        <div className="absolute inset-0 bg-[linear-gradient(rgba(147,51,234,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(147,51,234,0.04)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-100 bg-purple-500/5 rounded-full blur-3xl" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium mb-8">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
            Lawyer Referral Network · Join Now
          </div>
          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
            Grow your practice.
            <br />
            <span className="bg-gradient-to-r from-purple-400 via-fuchsia-300 to-pink-400 bg-clip-text text-transparent">
              Connect with clients.
            </span>
          </h1>
          <p className="mt-6 text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Join our curated Lawyer Referral Network and get matched with clients who need your specific legal expertise — powered by UnBind AI contract analysis.
          </p>
          {/* <div className="mt-8 flex flex-wrap justify-center gap-6 text-sm text-gray-400">
            {['No upfront fees', 'Verified client leads', 'Instant profile listing'].map((item) => (
              <span key={item} className="flex items-center gap-1.5">
                <span className="text-purple-400 font-bold">✓</span> {item}
              </span>
            ))}
          </div> */}
          <div className="mt-8 flex justify-center">
            <div className="flex flex-col items-center text-gray-600 animate-bounce">
              <ChevronDownIcon className="h-5 w-5" />
            </div>
          </div>
        </div>
      </section>

      {/* Registration Form */}
      <section className="py-12 sm:py-16">

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-white">
              Register your profile
            </h2>
            <p className="mt-3 text-gray-400 max-w-xl mx-auto">
              Fill in your details below. Once reviewed, your profile will be listed in the directory for Verdict plan users to find you.
            </p>
          </div>

          <div className="max-w-3xl mx-auto glass-card rounded-2xl p-6 sm:p-8">
            {lawyerSuccess ? (
              <div className="text-center py-8">
                <div className="flex justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-14 w-14 text-green-400">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-white mb-2">Application Submitted!</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                  Thank you for registering. Our team will review your application and get back to you shortly.
                </p>
                <button
                  onClick={() => setLawyerSuccess(false)}
                  className="mt-6 px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-500 transition-colors"
                >
                  Submit Another
                </button>
              </div>
            ) : (
            <form onSubmit={handleLawyerSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="lawyer-name" className="block text-sm font-medium text-gray-300 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    id="lawyer-name"
                    name="name"
                    required
                    value={lawyerForm.name}
                    onChange={handleLawyerField}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter your full name"
                  />
                </div>
                <div>
                  <label htmlFor="lawyer-email" className="block text-sm font-medium text-gray-300 mb-1">
                    Email Address
                  </label>
                  <input
                    type="email"
                    id="lawyer-email"
                    name="email"
                    required
                    value={lawyerForm.email}
                    onChange={handleLawyerField}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter your email"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="lawyer-city" className="block text-sm font-medium text-gray-300 mb-1">
                    City
                  </label>
                  <input
                    type="text"
                    id="lawyer-city"
                    name="city"
                    required
                    value={lawyerForm.city}
                    onChange={handleLawyerField}
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter your city"
                  />
                </div>
                <div>
                  <label htmlFor="lawyer-experience" className="block text-sm font-medium text-gray-300 mb-1">
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
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter years of experience"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="lawyer-phone" className="block text-sm font-medium text-gray-300 mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  type="tel"
                  id="lawyer-phone"
                  name="phone"
                  value={lawyerForm.phone}
                  onChange={handleLawyerField}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                  placeholder="Enter your phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
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
                    <label key={spec} className="flex items-center gap-2 text-sm text-gray-300">
                      <input
                        type="checkbox"
                        className="rounded bg-gray-800 border-gray-700 text-indigo-600 focus:ring-indigo-500"
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
                <label htmlFor="lawyer-bio" className="block text-sm font-medium text-gray-300 mb-1">
                  Professional Bio
                </label>
                <textarea
                  id="lawyer-bio"
                  name="bio"
                  required
                  rows={4}
                  value={lawyerForm.bio}
                  onChange={handleLawyerField}
                  className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all resize-none"
                  placeholder="Tell us about your experience, expertise, and what makes you unique as a legal professional..."
                />
              </div>

              <div className="flex items-center">
                <input
                  id="lawyer-terms"
                  type="checkbox"
                  checked={lawyerTerms}
                  onChange={(e) => setLawyerTerms(e.target.checked)}
                  className="h-4 w-4 rounded bg-gray-800 border-gray-700 text-indigo-600 focus:ring-indigo-500"
                />
                <label htmlFor="lawyer-terms" className="ml-2 block text-sm text-gray-300">
                  I agree to the terms and conditions and consent to having my information shared with potential clients.
                </label>
              </div>

              {lawyerError && (
                <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-md">
                  {lawyerError}
                </p>
              )}

              <div className="pt-4">
                <button
                  type="submit"
                  disabled={lawyerSubmitting}
                  className="w-full inline-flex justify-center items-center px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
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
