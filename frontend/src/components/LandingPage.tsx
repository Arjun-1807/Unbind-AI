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

const LandingPage: React.FC = () => {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install -g unbindai");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full fade-in">
      {/* Hero */}
      <section className="pt-20 sm:pt-28 lg:pt-36 pb-16 sm:pb-20 relative overflow-hidden">
        {/* Subtle grid background */}
        <div className="absolute inset-0 bg-[linear-gradient(rgba(99,102,241,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.03)_1px,transparent_1px)] bg-size-[64px_64px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-200 h-150 bg-indigo-500/5 rounded-full blur-3xl" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative">
          <div className="text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-sm font-medium mb-8">
              <SparklesIcon className="h-3.5 w-3.5" />
              AI-Powered Contract Intelligence
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-white leading-[1.1]">
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
              <div className="inline-flex items-center gap-2">
                <div
                  onClick={handleCopy}
                  className="group cursor-pointer inline-flex items-center gap-3 px-5 py-3 rounded-lg bg-gray-900/80 border border-gray-700/80 hover:border-indigo-500/50 transition-all duration-200"
                >
                  <span className="text-green-400 font-mono text-sm select-none">$</span>
                  <code className="text-gray-200 font-mono text-sm sm:text-base">
                    npm install -g unbindai
                  </code>
                  <span className="text-gray-500 group-hover:text-indigo-400 transition-colors">
                    {copied ? (
                      <CheckIcon className="h-4 w-4 text-green-400" />
                    ) : (
                      <CopyIcon className="h-4 w-4" />
                    )}
                  </span>
                </div>
                <div className="relative group/info">
                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-gray-500 hover:text-indigo-400 cursor-help transition-colors">
                    <circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="16" y2="12" /><line x1="12" x2="12.01" y1="8" y2="8" />
                  </svg>
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 rounded-md bg-gray-800 border border-gray-700 text-xs text-gray-300 whitespace-nowrap opacity-0 pointer-events-none group-hover/info:opacity-100 transition-opacity duration-200">
                    CLI is available only for Verdict plan users
                    <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
                  </div>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-center gap-3">
                <button
                  onClick={() => router.push("/signup")}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 transition-all duration-200"
                >
                  Start Analyzing Free
                  <ArrowRightIcon className="ml-2 h-4 w-4" />
                </button>
                <button
                  onClick={() => router.push("/login")}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3 font-semibold text-gray-300 bg-white/5 border border-gray-700 rounded-lg hover:bg-white/10 hover:border-gray-600 transition-all duration-200"
                >
                  Sign In
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hero Screenshot Placeholder */}
      <section className="pb-16 sm:pb-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="rounded-xl border border-gray-700/50 bg-gray-900/60 backdrop-blur-sm overflow-hidden shadow-2xl shadow-indigo-500/10">
            {/* Window chrome */}
            <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-700/50 bg-gray-900/80">
              <div className="w-3 h-3 rounded-full bg-red-500/70" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
              <div className="w-3 h-3 rounded-full bg-green-500/70" />
              <span className="ml-3 text-xs text-gray-500 font-mono">unbind — contract analysis</span>
            </div>
            {/* Placeholder image area */}
            <div className="aspect-video bg-linear-to-br from-gray-800/50 to-gray-900/50 flex items-center justify-center">
              <div className="text-center">
                <FileTextIcon className="h-16 w-16 text-indigo-500/30 mx-auto mb-4" />
                <p className="text-gray-500 text-sm font-medium">App Screenshot — Risk Analysis Dashboard</p>
                <p className="text-gray-600 text-xs mt-1">Replace with actual product screenshot</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-16 sm:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Everything you need to understand any contract
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
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
      <section className="py-16 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-sm font-medium mb-6">
                <TerminalIcon className="h-3.5 w-3.5" />
                CLI Tool · Exclusive to Verdict
              </div>
              <h2 className="text-3xl sm:text-4xl font-bold text-white">
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
              <div className="p-5 font-mono text-sm leading-relaxed">
                <div className="text-gray-400">
                  <span className="text-green-400">$</span> npm install -g unbindai
                </div>
                <div className="text-gray-500 mt-1">added 42 packages in 3s</div>
                <div className="text-gray-400 mt-3">
                  <span className="text-green-400">$</span> unbind contract.pdf
                </div>
                <div className="mt-2 text-gray-500">
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
      <section className="py-16 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">How it works</h2>
            <p className="mt-4 text-lg text-gray-400">Three steps to contract clarity</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: "01",
                title: "Upload your contract",
                desc: "Drag and drop any PDF contract. We support NDAs, employment agreements, SaaS terms, and more.",
                placeholder: "Upload UI Screenshot",
              },
              {
                step: "02",
                title: "AI analyzes every clause",
                desc: "Our AI reads each clause, scores risk levels, extracts key dates, and generates plain-English summaries.",
                placeholder: "Analysis View Screenshot",
              },
              {
                step: "03",
                title: "Review and negotiate",
                desc: "Explore risks, get alternative clauses, simulate scenarios, and export a full report as PDF.",
                placeholder: "Report View Screenshot",
              },
            ].map((step, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-extrabold text-indigo-500/20 mb-4">{step.step}</div>
                {/* Image placeholder */}
                <div className="rounded-lg border border-gray-700/50 bg-gray-900/60 aspect-4/3 flex items-center justify-center mb-6">
                  <div className="text-center px-4">
                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-2">
                      <FileTextIcon className="h-5 w-5 text-indigo-400" />
                    </div>
                    <p className="text-gray-600 text-xs">{step.placeholder}</p>
                  </div>
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Plans */}
      <section className="py-16 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-white">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-lg text-gray-400 max-w-2xl mx-auto">
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
                className="w-full py-2.5 rounded-lg font-semibold text-indigo-300 bg-white/5 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
              >
                Get Brief
              </button>
            </div>

            {/* Motion — Popular */}
            <div className="glass-card rounded-2xl p-6 flex flex-col relative border-2 border-indigo-500/60!">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-indigo-600 text-white px-3 py-0.5 rounded-full text-xs font-semibold">
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
                className="w-full py-2.5 rounded-lg font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition-colors"
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
                className="w-full py-2.5 rounded-lg font-semibold text-indigo-300 bg-white/5 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
              >
                Get Verdict
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Extra features row */}
      <section className="py-16 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* PDF Export card */}
            <div className="glass-card rounded-xl p-8 flex flex-col justify-between">
              <div>
                <DownloadIcon className="h-8 w-8 text-indigo-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">PDF Export & Modified Contracts</h3>
                <p className="text-gray-400 leading-relaxed">
                  Download your full analysis as a formatted PDF report. Export modified contracts
                  with your negotiated clause changes applied — ready to send to the other party.
                </p>
              </div>
              {/* Image placeholder */}
              <div className="mt-6 rounded-lg border border-gray-700/40 bg-gray-800/30 aspect-2/1 flex items-center justify-center">
                <p className="text-gray-600 text-xs">PDF Export Screenshot</p>
              </div>
            </div>

            {/* Dashboard card */}
            <div className="glass-card rounded-xl p-8 flex flex-col justify-between">
              <div>
                <LogoIcon className="h-8 w-8 text-indigo-400 mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">Dashboard & History</h3>
                <p className="text-gray-400 leading-relaxed">
                  All your past analyses in one place. Re-visit any contract, compare risk scores
                  over time, and manage your account with secure JWT-based authentication.
                </p>
              </div>
              {/* Image placeholder */}
              <div className="mt-6 rounded-lg border border-gray-700/40 bg-gray-800/30 aspect-2/1 flex items-center justify-center">
                <p className="text-gray-600 text-xs">Dashboard Screenshot</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-16 sm:py-24 border-t border-gray-800/50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">
            Stop signing contracts you don&apos;t fully understand
          </h2>
          <p className="mt-4 text-lg text-gray-400 max-w-xl mx-auto">
            Get started free — no credit card required. Analyze your first contract in under two minutes.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
            <button
              onClick={() => router.push("/signup")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 font-semibold text-white bg-indigo-600 rounded-lg shadow-lg shadow-indigo-500/25 hover:bg-indigo-500 hover:shadow-indigo-500/40 transition-all duration-200"
            >
              Get Started Free
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </button>
            <button
              onClick={() => router.push("/login")}
              className="w-full sm:w-auto inline-flex items-center justify-center px-8 py-3.5 font-semibold text-gray-300 bg-white/5 border border-gray-700 rounded-lg hover:bg-white/10 hover:border-gray-600 transition-all duration-200"
            >
              Sign In
            </button>
          </div>

          {/* CLI reminder */}
          <div className="mt-8">
            <p className="text-gray-500 text-sm mb-2">Or install the CLI</p>
            <div
              onClick={handleCopy}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-gray-900/80 border border-gray-700/80 hover:border-indigo-500/50 cursor-pointer transition-all duration-200"
            >
              <span className="text-green-400 font-mono text-sm">$</span>
              <code className="text-gray-300 font-mono text-sm">npm install -g unbindai</code>
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

      {/* Footer */}
      
    </div>
  );
};

export default LandingPage;
