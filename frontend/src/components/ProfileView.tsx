"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User, StoredAnalysis } from "@/types";
import {
  UserIcon,
  SparklesIcon,
  FileTextIcon,
  ShieldCheckIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  CalendarIcon,
  LogOutIcon,
} from "./Icons";
import {
  updatePassword,
  getUserPlan,
  cancelUserPlan,
  getPaymentHistory,
  type PaymentRecord,
} from "@/services/api";
import { formatMoney, formatDate } from "@/lib/formatMoney";
import { useAuth } from "@/context/AuthContext";
import BackLink from "./BackLink";
import ConfirmModal from "./ConfirmModal";

interface ProfileViewProps {
  user: User;
  analyses: StoredAnalysis[];
}

const FREE_MODEL = "llama-3.3-70b-versatile";

// Map internal model slugs to names a non-technical user understands, rather
// than leaking raw identifiers into the UI.
const MODEL_LABELS: Record<string, string> = {
  "llama-3.3-70b-versatile": "Llama 3.3 70B",
};
const friendlyModel = (slug: string) => MODEL_LABELS[slug] ?? slug;

type PlanState = {
  plan: string | null;
  isPro: boolean;
  aiModel: string;
  dailyCount: number;
  dailyLimit: number | null;
  limitReached: boolean;
};

type Feedback = { type: "success" | "error"; text: string };

const FeedbackBanner: React.FC<{ feedback: Feedback }> = ({ feedback }) => (
  <div
    className={`flex items-center gap-2 p-3 rounded-lg ${
      feedback.type === "success"
        ? "bg-success/10 text-success"
        : "bg-danger/10 text-danger"
    }`}
  >
    {feedback.type === "success" ? (
      <CheckCircleIcon className="h-5 w-5 shrink-0" />
    ) : (
      <AlertCircleIcon className="h-5 w-5 shrink-0" />
    )}
    <span className="text-sm">{feedback.text}</span>
  </div>
);

const ProfileView: React.FC<ProfileViewProps> = ({ user, analyses }) => {
  const router = useRouter();
  const { logout } = useAuth();

  // ── Password form ──
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [pwMessage, setPwMessage] = useState<Feedback | null>(null);

  // ── Plan / subscription ──
  const [planState, setPlanState] = useState<PlanState | null>(null);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [planMessage, setPlanMessage] = useState<Feedback | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [canceling, setCanceling] = useState(false);

  // ── Billing ──
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);

  const loadPlan = React.useCallback(async () => {
    try {
      const data = await getUserPlan();
      setPlanState(data);
    } catch {
      setPlanState({
        plan: null,
        isPro: false,
        aiModel: FREE_MODEL,
        dailyCount: 0,
        dailyLimit: null,
        limitReached: false,
      });
    } finally {
      setPlanLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getPaymentHistory();
        if (!cancelled) setPayments(Array.isArray(data) ? data : []);
      } catch {
        // On any failure just fall back to an empty history — never crash.
        if (!cancelled) setPayments([]);
      } finally {
        if (!cancelled) setPaymentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived plan values, preferring freshly-fetched data over the cached user.
  const plan = planState?.plan ?? user.plan ?? null;
  const isPro = planState?.isPro ?? user.pro === true;
  const aiModel = planState?.aiModel ?? user.aiModel ?? FREE_MODEL;
  const dailyCount = planState?.dailyCount ?? 0;
  const dailyLimit = planState?.dailyLimit ?? null;
  const limitReached = planState?.limitReached ?? false;

  const planLabel = isPro && plan ? plan : "Free";
  const memberSince = user.createdAt ? formatDate(user.createdAt) : "";
  const initial = user.username.charAt(0).toUpperCase();

  // ── Statistics ──
  const totalAnalyses = analyses.length;
  const totalClauses = analyses.reduce(
    (sum, a) => sum + a.analysisResult.clauses.length,
    0,
  );
  const highRiskCount = analyses.reduce(
    (sum, a) =>
      sum + a.analysisResult.clauses.filter((c) => c.riskLevel === "High").length,
    0,
  );

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMessage(null);

    if (newPassword !== confirmPassword) {
      setPwMessage({ type: "error", text: "New passwords do not match" });
      return;
    }
    if (newPassword.length < 6) {
      setPwMessage({
        type: "error",
        text: "Password must be at least 6 characters",
      });
      return;
    }

    setPwLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setPwMessage({ type: "success", text: "Password updated successfully!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowPasswordForm(false);
        setPwMessage(null);
      }, 2000);
    } catch (error) {
      setPwMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update password",
      });
    } finally {
      setPwLoading(false);
    }
  };

  const confirmCancel = async () => {
    setCanceling(true);
    setPlanMessage(null);
    try {
      await cancelUserPlan();
      await loadPlan();
      setPlanMessage({
        type: "success",
        text: "Your plan has been cancelled. You're now on the Free plan.",
      });
    } catch {
      setPlanMessage({
        type: "error",
        text: "Could not cancel your plan. Please try again.",
      });
    } finally {
      setCanceling(false);
      setShowCancelConfirm(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="space-y-8 fade-in">
      <ConfirmModal
        open={showCancelConfirm}
        title="Cancel your plan?"
        message="You'll lose your paid features and return to the Free plan. This can't be undone from here — you'd need to subscribe again."
        confirmLabel="Cancel plan"
        cancelLabel="Keep plan"
        loadingLabel="Cancelling…"
        loading={canceling}
        icon={<AlertTriangleIcon className="h-9 w-9 text-danger" />}
        onConfirm={confirmCancel}
        onCancel={() => setShowCancelConfirm(false)}
      />

      {/* Page header */}
      <div>
        <div className="w-full max-w-3xl mb-4 text-left">
          <BackLink href="/dashboard">Back to Dashboard</BackLink>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
          Your Profile
        </h2>
        <p className="mt-4 text-base sm:text-lg leading-8 text-ink-subtle">
          Manage your account, subscription, and security.
        </p>
      </div>

      {/* Identity header */}
      <div className="ln-card p-5 sm:p-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-center sm:text-left">
            {/* Avatar — real picture for OAuth users, initials otherwise */}
            {user.picture ? (
              // OAuth avatars come from arbitrary remote hosts; next/image would
              // need every provider domain whitelisted. A plain <img> is safe here.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.picture}
                alt={user.username}
                className="h-20 w-20 rounded-full object-cover shrink-0"
              />
            ) : (
              <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary text-3xl font-semibold text-white">
                {initial}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center justify-center gap-2 sm:justify-start">
                <UserIcon className="h-5 w-5 text-primary shrink-0" />
                <h3 className="truncate text-2xl font-semibold text-ink">
                  {user.username}
                </h3>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    isPro
                      ? "bg-success/10 text-success"
                      : "bg-surface-2 text-ink-muted"
                  }`}
                >
                  {planLabel}
                </span>
              </div>
              <p className="mt-1 truncate text-sm text-ink-subtle">{user.email}</p>
              {memberSince && (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-xs text-ink-subtle sm:justify-start">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Member since {memberSince}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={handleLogout}
            className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 sm:w-auto"
          >
            <LogOutIcon className="mr-2 h-4 w-4" />
            Logout
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 lg:items-start">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          {/* Subscription */}
          <div className="ln-card p-5 sm:p-8">
            <h4 className="mb-4 flex items-center text-lg font-semibold text-ink">
              <SparklesIcon className="mr-2 h-5 w-5 text-primary" />
              Subscription
            </h4>

            {planMessage && (
              <div className="mb-4">
                <FeedbackBanner feedback={planMessage} />
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-2xl font-semibold text-ink">{planLabel}</div>
                <div className="text-sm text-ink-subtle">
                  {isPro ? "Paid plan" : "Free plan"}
                </div>
              </div>
            </div>

            {/* Usage meter */}
            {planLoaded && (
              <div className="mt-5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-ink-subtle">Analyses today</span>
                  <span className="font-medium text-ink">
                    {dailyLimit === null
                      ? `${dailyCount} · Unlimited`
                      : `${dailyCount} / ${dailyLimit}`}
                  </span>
                </div>
                {dailyLimit !== null && (
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-surface-2">
                    <div
                      className={`h-full rounded-full transition-all ${
                        limitReached ? "bg-danger" : "bg-primary"
                      }`}
                      style={{
                        width: `${Math.min(
                          100,
                          dailyLimit > 0 ? (dailyCount / dailyLimit) * 100 : 0,
                        )}%`,
                      }}
                    />
                  </div>
                )}
                {limitReached && (
                  <p className="mt-1.5 text-xs text-danger">
                    Daily limit reached.
                    {!isPro && " Upgrade for a higher limit."}
                  </p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              {isPro && plan ? (
                <>
                  <Link href="/pricing" className="w-full sm:w-auto">
                    <button className="ln-btn-primary inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm">
                      Change plan
                    </button>
                  </Link>
                  <button
                    onClick={() => setShowCancelConfirm(true)}
                    className="inline-flex w-full cursor-pointer items-center justify-center rounded-lg border border-hairline px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-2 sm:w-auto"
                  >
                    Cancel plan
                  </button>
                </>
              ) : (
                <Link href="/pricing" className="w-full sm:w-auto">
                  <button className="ln-btn-primary inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm">
                    Upgrade to Pro
                    <SparklesIcon className="ml-2 h-4 w-4" />
                  </button>
                </Link>
              )}
            </div>
          </div>

          {/* Security */}
          <div className="ln-card p-5 sm:p-8">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h4 className="flex items-center text-lg font-semibold text-ink">
                <ShieldCheckIcon className="mr-2 h-5 w-5 text-primary" />
                Security
              </h4>
              {!showPasswordForm && (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="ln-btn-primary inline-flex w-full cursor-pointer items-center justify-center px-4 py-2 text-sm sm:w-auto"
                >
                  Update Password
                  <SparklesIcon className="ml-2 h-4 w-4" />
                </button>
              )}
            </div>

            {showPasswordForm ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label
                    htmlFor="currentPassword"
                    className="mb-1 block text-sm font-medium text-ink-muted"
                  >
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label
                    htmlFor="newPassword"
                    className="mb-1 block text-sm font-medium text-ink-muted"
                  >
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="ln-input w-full px-4 py-2"
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="mb-1 block text-sm font-medium text-ink-muted"
                  >
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="ln-input w-full px-4 py-2"
                    placeholder="Confirm new password"
                  />
                </div>

                {pwMessage && <FeedbackBanner feedback={pwMessage} />}

                <div className="flex flex-col gap-3 sm:flex-row">
                  <button
                    type="submit"
                    disabled={pwLoading}
                    className="ln-btn-primary inline-flex w-full items-center justify-center px-4 py-2 text-sm sm:flex-1"
                  >
                    {pwLoading ? "Updating..." : "Update Password"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setPwMessage(null);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="ln-btn-secondary w-full px-4 py-2 text-sm sm:w-auto"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-ink-subtle">
                Keep your account secure by updating your password regularly. We
                recommend a strong, unique password.
              </p>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Activity stats */}
          <div className="ln-card p-5 sm:p-6">
            <h4 className="mb-4 text-lg font-semibold text-ink">Activity</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileTextIcon className="h-5 w-5 text-primary" />
                  <span className="text-sm text-ink-subtle">Total analyses</span>
                </div>
                <span className="text-2xl font-semibold text-ink">
                  {totalAnalyses}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheckIcon className="h-5 w-5 text-primary" />
                  <span className="text-sm text-ink-subtle">Clauses reviewed</span>
                </div>
                <span className="text-2xl font-semibold text-ink">
                  {totalClauses}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircleIcon className="h-5 w-5 text-danger" />
                  <span className="text-sm text-ink-subtle">High risks found</span>
                </div>
                <span className="text-2xl font-semibold text-ink">
                  {highRiskCount}
                </span>
              </div>
            </div>
          </div>

          {/* Account details */}
          <div className="ln-card p-5 sm:p-6">
            <h4 className="mb-3 text-lg font-semibold text-ink">
              Account details
            </h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-ink-subtle">Member since</span>
                <span className="text-ink-muted">{memberSince || "—"}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink-subtle">Account type</span>
                <span
                  className={
                    isPro
                      ? "font-semibold text-success"
                      : "font-semibold text-primary"
                  }
                >
                  {planLabel}
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-ink-subtle">AI model</span>
                <span className="text-ink-muted">{friendlyModel(aiModel)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Billing history */}
      <div className="ln-card p-5 sm:p-8">
        <h4 className="mb-4 flex items-center text-lg font-semibold text-ink">
          <FileTextIcon className="mr-2 h-5 w-5 text-primary" />
          Billing history
        </h4>

        {paymentsLoading ? (
          <p className="text-sm text-ink-subtle">Loading…</p>
        ) : payments.length === 0 ? (
          <p className="text-sm text-ink-subtle">No payments yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-ink-muted">
                  <th className="py-2 pr-4 font-medium">Plan</th>
                  <th className="py-2 pr-4 font-medium">Amount</th>
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 font-medium">Payment ID</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr
                    key={p.id}
                    className="border-b border-hairline last:border-0"
                  >
                    <td className="py-3 pr-4 font-medium text-ink whitespace-nowrap">
                      {p.plan}
                    </td>
                    <td className="py-3 pr-4 text-ink whitespace-nowrap">
                      {formatMoney(p.amount, p.currency)}
                    </td>
                    <td className="py-3 pr-4 text-ink-subtle whitespace-nowrap">
                      {formatDate(p.createdAt)}
                    </td>
                    <td className="py-3 text-xs text-ink-muted break-all">
                      {p.razorpayPaymentId ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfileView;
