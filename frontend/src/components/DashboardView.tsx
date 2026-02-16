"use client";

import React from "react";
import type { User, StoredAnalysis, RiskLevel } from "@/types";
import {
  SparklesIcon,
  FileTextIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
} from "./Icons";
import { RISK_COLORS } from "@/constants";
import Link from "next/link";

interface DashboardViewProps {
  user: User;
  analyses: StoredAnalysis[];
  onSelectAnalysis: (analysis: StoredAnalysis) => void;
  onNewAnalysis: () => void;
}

const RiskSummary: React.FC<{ analysis: StoredAnalysis }> = ({ analysis }) => {
  const counts = analysis.analysisResult.clauses.reduce(
    (acc, clause) => {
      acc[clause.riskLevel] = (acc[clause.riskLevel] || 0) + 1;
      return acc;
    },
    {} as Record<RiskLevel, number>,
  );

  return (
    <div className="flex items-center space-x-3 text-xs">
      {counts.High > 0 && (
        <div className={`flex items-center space-x-1 ${RISK_COLORS.High.text}`}>
          <AlertCircleIcon className="h-4 w-4" />
          <span>{counts.High} High</span>
        </div>
      )}
      {counts.Medium > 0 && (
        <div
          className={`flex items-center space-x-1 ${RISK_COLORS.Medium.text}`}
        >
          <AlertTriangleIcon className="h-4 w-4" />
          <span>{counts.Medium} Medium</span>
        </div>
      )}
      {counts.Low > 0 && (
        <div className={`flex items-center space-x-1 ${RISK_COLORS.Low.text}`}>
          <ShieldCheckIcon className="h-4 w-4" />
          <span>{counts.Low} Low</span>
        </div>
      )}
      {counts.Negligible > 0 && (
        <div
          className={`flex items-center space-x-1 ${RISK_COLORS.Negligible.text}`}
        >
          <CheckCircleIcon className="h-4 w-4" />
          <span>{counts.Negligible} Neg</span>
        </div>
      )}
    </div>
  );
};
const PLAN_BENEFITS: Record<string, string[]> = {
  Brief: [
    "Unlimited contract analysis",
    "Basic risk detection",
    "Download summary PDF",
  ],
  Motion: [
    "Everything in Brief",
    "Advanced clause insights",
    "Priority support",
    "Export to Word",
  ],
  Verdict: [
    "Everything in Motion",
    "AI-powered negotiation suggestions",
    "Team collaboration",
    "Dedicated legal expert review",
  ],
};

const PlanTooltip: React.FC<{ plan: string }> = ({ plan }) => {
  if (!plan || !PLAN_BENEFITS[plan]) return null;
  return (
    <div className="absolute z-50 right-0 mt-2 w-64 bg-gray-900 text-white text-sm rounded-lg shadow-lg p-4 border border-indigo-500">
      <div className="font-bold mb-2">{plan} Plan Benefits</div>
      <ul className="list-disc pl-5 space-y-1">
        {PLAN_BENEFITS[plan].map((benefit) => (
          <li key={benefit}>{benefit}</li>
        ))}
      </ul>
    </div>
  );
};
const DashboardView: React.FC<DashboardViewProps> = ({
  user,
  analyses,
  onSelectAnalysis,
  onNewAnalysis,
}) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [plan, setPlan] = React.useState<string | null>(null);
  
    React.useEffect(() => {
      fetch("http://localhost:8000/api/user/plan/", { credentials: "include" })
        .then(res => res.json())
        .then(data => {
          setPlan(data.plan);
        });
    }, [])
  const isFreePlan = plan !== "Brief" && plan !== "Motion" && plan !== "Verdict";
  const hasReachedLimit = isFreePlan && analyses.length >= 1;
  return (
    <div className="space-y-10 fade-in">
      <div className="relative">
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Welcome back, {user.username}
        </h2>
        <div className="mt-4 flex items-center space-x-4">
          <p className="text-lg leading-8 text-gray-400">
            Review your past analyses or upload a new document to begin.
          </p>
        </div>
        <span
          className="absolute top-0 right-0 text-sm text-white px-3 py-1 cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
        >
          Active Plan :{plan? (<span className="text-green-400">{plan}</span>): (<span className="text-red-400">Free</span>)}
          {showTooltip && plan && (
            <PlanTooltip plan={plan} />
          )}
        </span>
      </div>

      <div className="glass-card p-6 sm:p-8 rounded-xl">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-semibold text-white">
            Your Document History
          </h3>
         {!hasReachedLimit ? (
  <button
    onClick={onNewAnalysis}
    className="inline-flex items-center px-4 py-2 font-semibold text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-500 transition-colors text-sm shadow-lg"
  >
    Analyze New Document
    <SparklesIcon className="ml-2 h-5 w-5" />
  </button>
) : (
 <Link href="/pricing"> <button className="inline-flex items-center px-4 py-2 font-semibold text-whitebg-gradient-to-r from-indigo-600 to-purple-600 border border-purple-600 rounded-md hover:from-indigo-500 hover:to-purple-500 transition-all text-sm shadow-lg cursor-pointer">
    Upgrade to pro to get more analyses
  </button></Link>
)}

          
        </div>

        {analyses.length > 0 ? (
          <div className="space-y-3">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                onClick={() => onSelectAnalysis(analysis)}
                className="group flex items-center justify-between p-4 rounded-lg bg-white/5 hover:bg-indigo-500/10 border border-transparent hover:border-indigo-500/30 cursor-pointer transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-indigo-500/10"
              >
                <div className="flex items-center space-x-4">
                  <FileTextIcon className="h-8 w-8 text-indigo-400 flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-gray-100 group-hover:text-white">
                      {analysis.fileName}
                    </p>
                    <p className="text-sm text-gray-400 group-hover:text-gray-300">
                      Analyzed on{" "}
                      {new Date(analysis.analysisDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <RiskSummary analysis={analysis} />
                  <span className="text-indigo-400 text-lg font-semibold transform group-hover:translate-x-1 transition-transform">
                    &rarr;
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border-2 border-dashed border-gray-800 rounded-lg">
            <FileTextIcon className="mx-auto h-12 w-12 text-gray-600" />
            <h3 className="mt-2 text-sm font-semibold text-gray-300">
              No documents analyzed
            </h3>
            <p className="mt-1 text-sm text-gray-500">
              Click &apos;Analyze New Document&apos; to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DashboardView;
