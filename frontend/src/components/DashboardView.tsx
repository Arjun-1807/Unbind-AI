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
import ConfirmModal from "./ConfirmModal";
import Link from "next/link";

interface DashboardViewProps {
  user: User;
  analyses: StoredAnalysis[];
  onSelectAnalysis: (analysis: StoredAnalysis) => void;
  onNewAnalysis: () => void;
  onDeleteAnalysis: (analysisId: string) => void | Promise<void>;
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
    <div className="absolute z-50 right-0 mt-2 w-64 bg-surface-2 text-ink text-sm rounded-lg shadow-lg p-4 border border-hairline">
      <div className="font-semibold mb-2">{plan} Plan Benefits</div>
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
  onDeleteAnalysis,
}) => {
  const [showTooltip, setShowTooltip] = React.useState(false);
  const [plan, setPlan] = React.useState<string | null>(null);
  const [limitReached, setLimitReached] = React.useState(false);
  const [dailyCount, setDailyCount] = React.useState(0);
  const [dailyLimit, setDailyLimit] = React.useState<number | null>(1);
  const [pendingDelete, setPendingDelete] =
    React.useState<StoredAnalysis | null>(null);
  const [isDeleting, setIsDeleting] = React.useState(false);

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    try {
      setIsDeleting(true);
      await onDeleteAnalysis(pendingDelete.id);
      setPendingDelete(null);
    } finally {
      setIsDeleting(false);
    }
  };

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await import("@/services/api").then((m) => m.getUserPlan());
        if (!cancelled) {
          setPlan(data.plan);
          setLimitReached(data.limitReached);
          setDailyCount(data.dailyCount);
          setDailyLimit(data.dailyLimit);
        }
      } catch {
        if (!cancelled) {
          setPlan(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Treat the user as "pro" if either:
  // - the auth user object says pro === true, or
  // - their active plan is one of the paid tiers.
  const isPaidPlan = plan === "Brief" || plan === "Motion" || plan === "Verdict";
  const isProUser = user.pro === true || isPaidPlan;
  return (
    <div className="space-y-8 sm:space-y-10 fade-in">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl break-words">
            Welcome back, {user.username}
          </h2>
          <p className="mt-3 sm:mt-4 text-base sm:text-lg leading-7 sm:leading-8 text-ink-subtle">
            Review your past analyses or upload a new document to begin.
          </p>
        </div>
        <span
          className="relative self-start shrink-0 text-sm text-ink cursor-pointer"
          onMouseEnter={() => setShowTooltip(true)}
          onMouseLeave={() => setShowTooltip(false)}
          onClick={() => setShowTooltip((v) => !v)}
        >
          Active Plan:
          {isProUser ? (
            <span className="ml-1 text-success">{plan}</span>
          ) : (
            <span className="ml-1 text-danger">Free</span>
          )}
          {showTooltip && plan && <PlanTooltip plan={plan} />}
        </span>
      </div>

      <div className="ln-card p-5 sm:p-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center mb-6">
          <h3 className="text-lg sm:text-xl font-semibold text-ink">
            Your Document History
          </h3>
          {!limitReached ? (
            <button
              onClick={onNewAnalysis}
              className="ln-btn-primary inline-flex items-center justify-center cursor-pointer w-full sm:w-auto px-4 py-2 text-sm"
            >
              Analyze New Document
              <SparklesIcon className="ml-2 h-5 w-5" />
            </button>
          ) : (
            <div className="flex flex-col items-stretch sm:items-end gap-1">
              <button
                disabled
                className="inline-flex items-center justify-center w-full sm:w-auto px-4 py-2 font-medium text-ink-subtle bg-surface-2 border border-hairline rounded-lg cursor-not-allowed text-sm opacity-60"
              >
                Analyze New Document
                <SparklesIcon className="ml-2 h-5 w-5" />
              </button>
              <span className="text-xs text-warning text-center sm:text-right">
                Daily limit reached ({dailyCount}/{dailyLimit ?? "∞"}).{" "}
                <Link
                  href="/pricing"
                  className="underline hover:text-ink"
                >
                  Upgrade your plan
                </Link>
              </span>
            </div>
          )}
        </div>

        {analyses.length > 0 ? (
          <div className="space-y-3">
            {analyses.map((analysis) => (
              <div
                key={analysis.id}
                onClick={() => onSelectAnalysis(analysis)}
                className="group flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-4 rounded-lg bg-surface-1 hover:bg-surface-2 border border-hairline cursor-pointer transition-colors duration-200"
              >
                <div className="flex items-center space-x-3 sm:space-x-4 min-w-0">
                  <FileTextIcon className="h-8 w-8 text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium text-ink truncate">
                      {analysis.fileName}
                    </p>
                    <p className="text-sm text-ink-subtle group-hover:text-ink-muted">
                      Analyzed on{" "}
                      {new Date(analysis.analysisDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-4 flex-wrap pl-11 sm:pl-0">
                  <RiskSummary analysis={analysis} />
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete(analysis);
                      }}
                      className="text-xs text-danger hover:text-danger underline cursor-pointer"
                    >
                      Delete
                    </button>
                    <span className="hidden sm:inline text-primary text-lg font-semibold transform group-hover:translate-x-1 transition-transform">
                      &rarr;
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 border border-dashed border-hairline rounded-lg">
            <FileTextIcon className="mx-auto h-12 w-12 text-ink-tertiary" />
            <h3 className="mt-2 text-sm font-semibold text-ink-muted">
              No documents analyzed
            </h3>
            <p className="mt-1 text-sm text-ink-subtle">
              Click &apos;Analyze New Document&apos; to get started.
            </p>
          </div>
        )}
      </div>

      {/* Verdict-only: Find a Lawyer banner */}
      {plan === "Verdict" && (
        <div className="ln-card p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="ln-badge text-xs font-medium text-ink-muted bg-surface-2 border border-hairline px-2.5 py-0.5 rounded-full">
                  Verdict Exclusive
                </span>
              </div>
              <h3 className="text-xl font-semibold text-ink">
                Curated Lawyer Assistance
              </h3>
              <p className="mt-1 text-sm text-ink-subtle">
                Connect with vetted legal professionals who specialise in the
                same contract types our AI analyses — employment, SaaS, real
                estate, NDAs, and more.
              </p>
            </div>
            <Link
              href="/lawyers"
              className="ln-btn-primary shrink-0 inline-flex items-center px-5 py-2.5 text-sm"
            >
              Find a Lawyer
              <span className="ml-2">→</span>
            </Link>
          </div>
        </div>
      )}

      <ConfirmModal
        open={pendingDelete !== null}
        title="Delete this analysis?"
        message={
          pendingDelete
            ? `“${pendingDelete.fileName}” will be permanently removed. This action cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        loading={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setPendingDelete(null);
        }}
      />
    </div>
  );
};

export default DashboardView;
