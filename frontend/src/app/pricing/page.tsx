"use client";
import React from "react";
import Header from "@/components/Header";
import { LogoIcon } from "@/components/Icons";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { activateUserPlan } from "@/services/api";
import { useAuth } from "@/context/AuthContext";
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
      ? "w-full bg-gray-700 text-gray-400 font-semibold py-2.5 rounded-lg cursor-not-allowed opacity-60"
      : "w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition-colors";
  const btnLabel = (btnPlan: string, label: string) =>
    btnPlan === currentPlan ? "Current Plan" : activating === btnPlan ? "Activating…" : label;
  return (
    <>
          <Header />
          
      <div className="min-h-screen bg-gradient-to-br pt-24 pb-16 px-4 fade-in font-sans">
        <div className="max-w-7xl mx-auto">
            <div className="w-full max-w-3xl mb-4 text-left">
        <Link href="/profile"><button
          onClick={onBack}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          &larr; Back
        </button></Link>
      </div>
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            {/* Left Section - Information */}
            <div className="space-y-8">
              <div>
                <h1 className="text-5xl font-bold text-white mb-4">
                  Unlock Pro Features
                </h1>
                <p className="text-xl">
                  Upgrade to UnBind Pro and supercharge your contract analysis
                  experience.
                </p>
              </div>

              <div className="space-y-6">
                <div className="flex gap-4">
                  <div className="text-3xl">⚡</div>
                  <div>
                    <h3 className="text-xl font-semibold mb-2">
                      Advanced AI Analysis
                    </h3>
                    <p className="">
                      Access higher-end AI models for more accurate and nuanced
                      contract analysis.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-3xl">🔍</div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Deeper Insights
                    </h3>
                    <p className="">
                      Unlock more detailed risk analysis, negotiation
                      suggestions, and key term extraction.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="text-3xl">👨‍⚖️</div>
                  <div>
                    <h3 className="text-xl font-semibold text-white mb-2">
                      Curated Lawyer Assistance
                    </h3>
                    <p className="">
                      Get access to a network of expert lawyers for further
                      enquiry and personalized help.
                    </p>
                  </div>
                </div>
              </div>

              <div className=" backdrop-blur-sm rounded-lg p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">✓</span>
                  <p className="text-white font-semibold">Cancel Anytime</p>
                </div>
                <p className="text-purple-200 text-sm">
                  No risk, no long-term commitment. Cancel your subscription
                  whenever you want.
                </p>
              </div>
            </div>

            {/* Right Section - Pricing Cards */}
            <div className="space-y-6">
              <h2 className="text-3xl font-bold text-white text-center mb-8">
                Choose Your Plan
              </h2>

              {/* Top Row - Pro 1 and Pro 2 side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Pro 1 Card */}
                <div className="backdrop-blur-md rounded-2xl p-6 border border-indigo-500/30 hover:border-purple-400/60 transition-all hover:shadow-2xl hover:shadow-purple-500/20 flex flex-col">
                  <div className="flex flex-col mb-4">
                    <h3 className="text-xl font-bold text-white mb-2">Brief</h3>
                    <div>
                      <div className="text-2xl font-bold text-purple-300">
                        ₹100
                      </div>
                      <div className="text-sm text-purple-200">1 Month</div>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-grow">
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Top-end AI models</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Faster analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Valid for 1 month</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
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
                <div className=" backdrop-blur-md rounded-2xl p-6 border-2 border-purple-400 hover:border-purple-300 transition-all hover:shadow-2xl hover:shadow-purple-400/30 relative flex flex-col">
                  <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-purple-500 to-pink-500 text-white px-3 py-0.5 rounded-full text-xs font-semibold">
                      POPULAR
                    </span>
                  </div>
                  <div className="flex flex-col mb-4">
                    <h3 className="text-xl font-bold text-white mb-2">Motion</h3>
                    <div>
                      <div className="text-2xl font-bold text-purple-300">
                        ₹450
                      </div>
                      <div className="text-sm text-purple-200">3 Months</div>
                    </div>
                  </div>
                  <ul className="space-y-2 mb-6 flex-grow">
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Top-end AI models</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Faster analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span className="font-semibold">Deeper analysis</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
                      <span>Valid for 3 months</span>
                    </li>
                    <li className="flex items-start gap-2 text-purple-100 text-sm">
                      <span className="text-green-400 mt-0.5">✓</span>
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
              <div className="backdrop-blur-md rounded-2xl p-8 border border-purple-500/30 hover:border-purple-400/60 transition-all hover:shadow-2xl hover:shadow-purple-500/20">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-bold text-white">Verdict</h3>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-purple-300">
                      ₹1500
                    </div>
                    <div className="text-sm text-purple-200">Lifetime</div>
                  </div>
                </div>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>Top-end AI models</span>
                  </li>
                  <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>Faster analysis</span>
                  </li>
                  <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span>Deeper analysis</span>
                  </li>
                  <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="font-semibold">
                      Curated lawyer assistance
                    </span>
                  </li>
                  <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="font-semibold">Lifetime access</span>
                  </li>
                   <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="font-semibold">Unlimited Analysis</span>
                  </li>
                   <li className="flex items-start gap-2 text-purple-100">
                    <span className="text-green-400 mt-1">✓</span>
                    <span className="font-semibold">CLI tool access</span>
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
      <footer className="text-center py-8 text-sm text-gray-500">
        <div className="flex items-center justify-center space-x-2">
          <LogoIcon className="h-6 w-6 text-indigo-500" />
          <p>UnBind: AI Legal Contract Analyzer</p>
        </div>
      </footer>
    </>
  );
}