"use client";
import React from "react";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { activateUserPlan } from "@/services/api";
import { useAuth } from "@/context/AuthContext";

const TerminalIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);
export default function Pricing() {
    const router = useRouter();
  const { user, authReady } = useAuth();
  const onBack = () => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push('/dashboard')
    }
    }
  const [currentPlan, setCurrentPlan] = React.useState<string | null>(null);
  const [activating, setActivating] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!authReady || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await import("@/services/api").then((m) => m.getUserPlan());
        if (!cancelled) setCurrentPlan(data.plan);
      } catch {
        if (!cancelled) setCurrentPlan(null);
      }
    })();
    return () => { cancelled = true; };
  }, [authReady, user]);

  const handleSelectPlan = async (selectedPlan: string) => {
    if (selectedPlan === currentPlan || activating) return;
    setActivating(selectedPlan);
    try {
      await activateUserPlan(selectedPlan);
      router.push("/profile");
    } catch {
      setActivating(null);
    }
  };

  const isDisabled = (btnPlan: string) => btnPlan === currentPlan || activating !== null;
  const btnClass = (btnPlan: string) =>
    isDisabled(btnPlan)
      ? "w-full bg-surface-2 text-ink-subtle font-semibold py-2.5 rounded-lg cursor-not-allowed opacity-60"
      : "w-full cursor-pointer ln-btn-primary justify-center py-2.5 rounded-lg";
  const btnLabel = (btnPlan: string, label: string) =>
    btnPlan === currentPlan ? "Current Plan" : activating === btnPlan ? "Activating…" : label;
  return (
    <>
          <Header />
          
      <div className="min-h-screen bg-canvas pt-20 sm:pt-24 pb-12 sm:pb-16 px-4 sm:px-6 lg:px-8 fade-in font-sans">
        <div className="max-w-7xl mx-auto">
            <div className="w-full max-w-3xl mb-4 text-left">
        <Link href="/profile"><button
          onClick={onBack}
          className="text-sm cursor-pointer text-primary hover:text-primary-hover transition-colors"
        >
          &larr; Back
        </button></Link>
      </div>
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Left Section - Information */}
            <div className="space-y-8">
              <div>
                <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold text-ink mb-4">
                  Unlock Pro Features
                </h1>
                <p className="text-lg sm:text-xl text-ink-muted">
                  Upgrade to UnBind Pro and supercharge your contract analysis
                  experience.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="text-3xl">⚡</div>
                  <div>
                    <h3 className="text-xl font-semibold text-ink mb-2">
                      Advanced AI Analysis
                    </h3>
                    <p className="text-ink-muted">
                      Access higher-end AI models for more accurate and nuanced
                      contract analysis.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-3xl">🔍</div>
                  <div>
                    <h3 className="text-xl font-semibold text-ink mb-2">
                      Deeper Insights
                    </h3>
                    <p className="text-ink-muted">
                      Unlock more detailed risk analysis, negotiation
                      suggestions, and key term extraction.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-3xl">👨‍⚖️</div>
                  <div>
                    <h3 className="text-xl font-semibold text-ink mb-2">
                      Curated Lawyer Assistance
                    </h3>
                    <p className="text-ink-muted">
                      Get access to a network of expert lawyers for further
                      enquiry and personalized help.
                    </p>
                  </div>
                </div>
              </div>

              <div className="ln-card p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">✓</span>
                  <p className="text-ink font-semibold">Cancel Anytime</p>
                </div>
                <p className="text-ink-muted text-sm">
                  No risk, no long-term commitment. Cancel your subscription
                  whenever you want.
                </p>
              </div>
            </div>

            {/* Right Section - Pricing Cards */}
            <div className="space-y-6">
              <h2 className="text-2xl sm:text-3xl font-semibold text-ink text-center mb-8">
                Choose Your Plan
              </h2>

              {/* Top Row - Pro 1 and Pro 2 side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pro 1 Card */}
                <div className="ln-card p-6 hover:bg-surface-2 transition-colors flex flex-col">
                  <div className="flex flex-col mb-4">
                    <h3 className="text-xl font-semibold text-ink mb-2">Brief</h3>
                    <div>
                      <div className="text-2xl font-semibold text-ink">
                        ₹100
                      </div>
                      <div className="text-sm text-ink-subtle">1 Month</div>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-grow">
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Top-end AI models</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Faster analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Valid for 1 month</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>3 analysis per day</span>
                    </li>
                  </ul>
                  {/* <Link href="/checkout?plan=pro1"> */}
                    <button className={btnClass("Brief")} onClick={() => handleSelectPlan("Brief")} disabled={isDisabled("Brief")}>
                      {btnLabel("Brief", "Get Brief")}
                    </button>
                  {/* </Link> */}
                </div>

                {/* Pro 2 Card - Popular */}
                <div className="ln-card-raised rounded-2xl p-6 relative flex flex-col">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-primary text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                      POPULAR
                    </span>
                  </div>
                  <div className="flex flex-col mb-4">
                    <h3 className="text-xl font-semibold text-ink mb-2">Motion</h3>
                    <div>
                      <div className="text-2xl font-semibold text-ink">
                        ₹450
                      </div>
                      <div className="text-sm text-ink-subtle">3 Months</div>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-grow">
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Top-end AI models</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Faster analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span className="font-semibold">Deeper analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>Valid for 3 months</span>
                    </li>
                    <li className="flex items-start gap-2 text-ink-muted text-sm">
                      <span className="text-success mt-0.5">✓</span>
                      <span>5 analyses per day</span>
                    </li>
                  </ul>
                  {/* <Link href="/checkout?plan=pro2"> */}
                    <button className={btnClass("Motion")} onClick={() => handleSelectPlan("Motion")} disabled={isDisabled("Motion")}>
                      {btnLabel("Motion", "Get Motion")}
                    </button>
                  {/* </Link> */}
                              </div>
                              
              </div>

              {/* Bottom Row - Pro 3 full width */}
              <div className="ln-card p-6 sm:p-8 hover:bg-surface-2 transition-colors">
                <div className="flex justify-between items-start gap-3 mb-4">
                  <h3 className="text-xl sm:text-2xl font-semibold text-ink min-w-0 break-words">Verdict</h3>
                  <div className="text-right shrink-0">
                    <div className="text-2xl sm:text-3xl font-semibold text-ink">
                      ₹1500
                    </div>
                    <div className="text-sm text-ink-subtle">Lifetime</div>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span>Top-end AI models</span>
                  </li>
                  <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span>Faster analysis</span>
                  </li>
                  <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span>Deeper analysis</span>
                  </li>
                  <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span className="font-semibold">
                      Curated lawyer assistance
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span className="font-semibold">Lifetime access</span>
                  </li>
                   <li className="flex items-start gap-2 text-ink-muted">
                    <span className="text-success mt-1">✓</span>
                    <span className="font-semibold">Unlimited Analysis</span>
                  </li>
                   <li className="flex items-start gap-2 text-sm">
                  <TerminalIcon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <span className="text-primary font-semibold">CLI tool access (exclusive)</span>
                </li>
                </ul>
                {/* <Link href="/checkout?plan=pro3"> */}
                  <button className={btnClass("Verdict")} onClick={() => handleSelectPlan("Verdict")} disabled={isDisabled("Verdict")}>
                    {btnLabel("Verdict", "Get Verdict")}
                  </button>
                {/* </Link> */}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-8 text-sm text-ink-subtle">
        <div className="flex items-center justify-center space-x-2">
          <LogoIcon className="h-6 w-6 text-primary" />
          <p>UnBind: AI Legal Contract Analyzer</p>
        </div>
      </footer>
    </>
  );
}