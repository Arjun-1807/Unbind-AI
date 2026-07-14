"use client";

import React, { useState } from "react";
import type { User, StoredAnalysis } from "@/types";
import { UserIcon, SparklesIcon, FileTextIcon, ShieldCheckIcon, CheckCircleIcon, AlertCircleIcon, LogOutIcon } from "./Icons";
import { updatePassword, getUserPlan, cancelUserPlan } from "@/services/api";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

interface ProfileViewProps {
  user: User;
  analyses: StoredAnalysis[];
}

const ProfileView: React.FC<ProfileViewProps> = ({ user, analyses }) => {
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const router = useRouter();
  const { logout } = useAuth();

  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    if (newPassword.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setLoading(true);
    try {
      await updatePassword(currentPassword, newPassword);
      setMessage({ type: 'success', text: 'Password updated successfully!' });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setTimeout(() => {
        setShowPasswordForm(false);
        setMessage(null);
      }, 2000);
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Failed to update password' });
    } finally {
      setLoading(false);
    }
  };

  // Calculate statistics
  const totalAnalyses = analyses.length;
  const totalClauses = analyses.reduce((sum, a) => sum + a.analysisResult.clauses.length, 0);
  const highRiskCount = analyses.reduce(
    (sum, a) => sum + a.analysisResult.clauses.filter(c => c.riskLevel === 'High').length,
    0
  );

  // const onBack = () => {
  //   router.push('/dashboard')
  // }

  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  // const handleGetPro = () => {
  //   router.push("/pricing");
  // };

  const [plan, setPlan] = React.useState<string | null>(null);
  const [isPro, setIsPro] = React.useState<boolean>(user.pro === true);
  const [aiModel, setAiModel] = React.useState<string>(
    user.aiModel || (user.pro ? "gpt-oss-120b" : "llama-3.3-70b-versatile")
  );
  const [planLoaded, setPlanLoaded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getUserPlan();
        if (!cancelled) {
          setPlan(data.plan);
          setIsPro(data.isPro);
          setAiModel(data.aiModel);
          setPlanLoaded(true);
        }
      } catch {
        if (!cancelled) {
          setPlan(null);
          setIsPro(false);
          setAiModel("llama-3.3-70b-versatile");
          setPlanLoaded(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleCancel = async () => {
    try {
      await cancelUserPlan();
      setPlan(null);
      setIsPro(false);
      setAiModel("llama-3.3-70b-versatile");
    } catch {
      // Silently ignore for now; UI will still show old plan until next refresh
    }
  }
  const handlePlandUpdate = () => {
    router.push("/pricing");
  }

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div>
        <div className="w-full max-w-3xl mb-4 text-left">
         <Link href="/dashboard"><button
            // onClick={onBack}
            className="text-sm cursor-pointer text-primary hover:text-primary-hover transition-colors"
          >
            &larr; Back to Dashboard
          </button></Link>
        </div>
        <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
          Your Profile
        </h2>
        <p className="mt-4 text-base sm:text-lg leading-8 text-ink-subtle">
          Manage your account information and view your activity.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:items-start">
        {/* Main Profile Card */}
        <div className="relative lg:col-span-2 ln-card p-5 sm:p-8">
          <button
            onClick={handleLogout}
            className="w-full sm:w-auto mb-4 sm:mb-0 justify-center sm:justify-start sm:absolute sm:top-6 sm:right-6 inline-flex items-center px-4 py-2 font-medium cursor-pointer text-white bg-danger border border-transparent rounded-lg hover:bg-danger/90 transition-colors text-sm"
          >
            <LogOutIcon className="mr-2 h-4 w-4" />
            Logout
          </button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Left Section */}
            <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:text-left gap-4 sm:space-x-4 sm:gap-0 w-full min-w-0">
              {/* Avatar */}
              <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center text-white text-3xl font-semibold shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              {/* User Info */}
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center justify-center sm:justify-start space-x-2 min-w-0">
                  <UserIcon className="h-5 w-5 text-primary" />
                  <h3 className="text-2xl font-semibold text-ink truncate">
                    {user.username}
                  </h3>
                </div>
                <p className="mt-1 text-ink-subtle text-sm truncate">
                  {user.email}
                </p>
                <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2 space-x-0 text-xs">
                  <ShieldCheckIcon className={`h-4 w-4 ${isPro ? 'text-success' : 'text-ink-subtle'}`} />
                  {isPro && plan ? (
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 sm:gap-3">
                      <span className="text-success font-semibold">
                        Active Plan: {plan}
                      </span>
                      <button
                        className="inline-flex cursor-pointer items-center px-3 py-1 font-medium text-ink-muted border border-hairline rounded-lg hover:bg-surface-2 transition-colors text-xs"
                        onClick={handleCancel}
                      >
                        Cancel Plan
                      </button>
                      <button
                        className="inline-flex cursor-pointer items-center px-3 py-1 font-medium text-ink-muted border border-hairline rounded-lg hover:bg-surface-2 transition-colors text-xs"
                        onClick={handlePlandUpdate}
                      >
                        Update Plan
                      </button>
                    </div>
                  ) : (
                    <span className="text-ink-subtle">
                      Active Plan: Free
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-hairline"></div>

          {/* Password Update Section */}
          <div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <h4 className="text-lg font-semibold text-ink flex items-center">
                <ShieldCheckIcon className="h-5 w-5 mr-2 text-primary" />
                Security
              </h4>
              {!showPasswordForm && (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="ln-btn-primary w-full sm:w-auto justify-center inline-flex cursor-pointer items-center px-4 py-2 text-sm"
                >
                  Update Password
                  <SparklesIcon className="ml-2 h-4 w-4" />
                </button>
              )}
            </div>

            {showPasswordForm ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-ink-muted mb-1">
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
                  <label htmlFor="newPassword" className="block text-sm font-medium text-ink-muted mb-1">
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
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-ink-muted mb-1">
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

                {message && (
                  <div className={`flex items-center space-x-2 p-3 rounded-lg ${
                    message.type === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
                  }`}>
                    {message.type === 'success' ? (
                      <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                      <AlertCircleIcon className="h-5 w-5" />
                    )}
                    <span className="text-sm">{message.text}</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="ln-btn-primary w-full sm:flex-1 inline-flex justify-center items-center px-4 py-2 text-sm"
                  >
                    {loading ? 'Updating...' : 'Update Password'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordForm(false);
                      setMessage(null);
                      setCurrentPassword("");
                      setNewPassword("");
                      setConfirmPassword("");
                    }}
                    className="ln-btn-secondary w-full sm:w-auto px-4 py-2 text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-ink-subtle">
                Keep your account secure by updating your password regularly. We recommend using a strong, unique password.
              </p>
            )}
          </div>
        </div>

        {/* Statistics Card */}
        <div className="space-y-6">
          <div className="ln-card p-5 sm:p-6">
            <h4 className="text-lg font-semibold text-ink mb-4">Activity Stats</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileTextIcon className="h-5 w-5 text-primary" />
                  <span className="text-sm text-ink-subtle">Total Analyses</span>
                </div>
                <span className="text-2xl font-semibold text-ink">{totalAnalyses}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheckIcon className="h-5 w-5 text-primary" />
                  <span className="text-sm text-ink-subtle">Clauses Reviewed</span>
                </div>
                <span className="text-2xl font-semibold text-ink">{totalClauses}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircleIcon className="h-5 w-5 text-danger" />
                  <span className="text-sm text-ink-subtle">High Risks Found</span>
                </div>
                <span className="text-2xl font-semibold text-ink">{highRiskCount}</span>
              </div>
            </div>
          </div>

          <div className="ln-card p-5 sm:p-6">
            <h4 className="text-lg font-semibold text-ink mb-3">Quick Info</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-subtle">Member Since</span>
                <span className="text-ink-muted">N/A</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">Last Login</span>
                <span className="text-ink-muted">Today</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">Account Type</span>
                <span className={isPro ? 'text-success font-semibold' : 'text-primary font-semibold'}>
                  {plan || 'Free'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-subtle">AI Model</span>
                <span className="text-ink-muted">{aiModel}</span>
              </div>
            </div>
          </div>

          {/* Get Pro Button for Free Users (wait for plan status to avoid flicker) */}
          {planLoaded && !isPro && (
            <div className="ln-card p-5 sm:p-6">
              <div className="text-center space-y-3">
                <SparklesIcon className="h-8 w-8 text-primary mx-auto" />
                <h4 className="text-lg font-semibold text-ink">Upgrade to Pro</h4>
                <p className="text-sm text-ink-subtle">
                  Unlock unlimited analyses and advanced features
                </p>
               <Link href="/pricing"><button
                  // onClick={handleGetPro}
                  className="ln-btn-primary w-full cursor-pointer inline-flex justify-center items-center px-4 py-2 text-sm"
                >
                  Get Pro
                  <SparklesIcon className="ml-2 h-4 w-4" />
                </button></Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfileView;