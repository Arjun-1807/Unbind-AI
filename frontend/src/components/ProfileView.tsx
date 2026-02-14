"use client";

import React, { useState } from "react";
import type { User, StoredAnalysis } from "@/types";
import { UserIcon, SparklesIcon, FileTextIcon, ShieldCheckIcon, CheckCircleIcon, AlertCircleIcon, LogOutIcon } from "./Icons";
import { updatePassword } from "@/services/api";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

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
  const onBack = () => {
    router.replace('/dashboard')
  }
  const handleLogout = async () => {
    await logout();
    router.push("/");
  };

  return (
    <div className="space-y-8 fade-in">
      {/* Header */}
      <div>
        <div className="w-full max-w-3xl mb-4 text-left">
        <button
          onClick={onBack}
          className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          &larr; Back to Dashboard
        </button>
      </div>
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Your Profile
        </h2>
        <p className="mt-4 text-lg leading-8 text-gray-400">
          Manage your account information and view your activity.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Profile Card */}
        <div className="relative lg:col-span-2 glass-card p-6 sm:p-8 rounded-xl">
          <button
  onClick={handleLogout}
  className="absolute top-6 right-6 inline-flex items-center px-4 py-2 font-semibold text-white bg-red-600 border border-transparent rounded-md hover:bg-red-500 transition-colors text-sm shadow-lg"
>
  Logout
  <LogOutIcon className="ml-2 h-4 w-4" />
</button>

          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6">
            {/* Left Section */}
            <div className="flex items-start space-x-4">
              {/* Avatar */}
              <div className="h-20 w-20 rounded-full bg-gradient-to-br from-indigo-600 to-indigo-400 flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
                {user.username.charAt(0).toUpperCase()}
              </div>
              {/* User Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2">
                  
                  <UserIcon className="h-5 w-5 text-indigo-400" />
                  <h3 className="text-2xl font-semibold text-white truncate">
                    {user.username}
                  </h3>
                </div>
                <p className="mt-1 text-gray-400 text-sm truncate">
                  {user.email}
                </p>
                <div className="mt-3 flex items-center space-x-2 text-xs text-green-500">
                  <ShieldCheckIcon className="h-4 w-4" />
                  <span>Account Active</span>
                </div>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="my-6 border-t border-gray-700"></div>

          {/* Password Update Section */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h4 className="text-lg font-semibold text-white flex items-center">
                <ShieldCheckIcon className="h-5 w-5 mr-2 text-indigo-400" />
                Security
              </h4>
              {!showPasswordForm && (
                <button
                  onClick={() => setShowPasswordForm(true)}
                  className="inline-flex items-center px-4 py-2 font-semibold text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-500 transition-colors text-sm shadow-lg"
                >
                  Update Password
                  <SparklesIcon className="ml-2 h-4 w-4" />
                </button>
              )}
            </div>

            {showPasswordForm ? (
              <form onSubmit={handlePasswordUpdate} className="space-y-4">
                <div>
                  <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    Current Password
                  </label>
                  <input
                    type="password"
                    id="currentPassword"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter current password"
                  />
                </div>
                <div>
                  <label htmlFor="newPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    New Password
                  </label>
                  <input
                    type="password"
                    id="newPassword"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Enter new password"
                  />
                </div>
                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-1">
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    id="confirmPassword"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    className="w-full px-4 py-2 bg-gray-800/50 border border-gray-700 rounded-md text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                    placeholder="Confirm new password"
                  />
                </div>

                {message && (
                  <div className={`flex items-center space-x-2 p-3 rounded-md ${
                    message.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
                  }`}>
                    {message.type === 'success' ? (
                      <CheckCircleIcon className="h-5 w-5" />
                    ) : (
                      <AlertCircleIcon className="h-5 w-5" />
                    )}
                    <span className="text-sm">{message.text}</span>
                  </div>
                )}

                <div className="flex space-x-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 inline-flex justify-center items-center px-4 py-2 font-semibold text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-500 transition-colors text-sm shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
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
                    className="px-4 py-2 font-semibold text-gray-300 bg-gray-700 border border-transparent rounded-md hover:bg-gray-600 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-sm text-gray-500">
                Keep your account secure by updating your password regularly. We recommend using a strong, unique password.
              </p>
            )}
          </div>
        </div>

        {/* Statistics Card */}
        <div className="space-y-6">
          <div className="glass-card p-6 rounded-xl">
            <h4 className="text-lg font-semibold text-white mb-4">Activity Stats</h4>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileTextIcon className="h-5 w-5 text-indigo-400" />
                  <span className="text-sm text-gray-400">Total Analyses</span>
                </div>
                <span className="text-2xl font-bold text-white">{totalAnalyses}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheckIcon className="h-5 w-5 text-blue-400" />
                  <span className="text-sm text-gray-400">Clauses Reviewed</span>
                </div>
                <span className="text-2xl font-bold text-white">{totalClauses}</span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <AlertCircleIcon className="h-5 w-5 text-red-400" />
                  <span className="text-sm text-gray-400">High Risks Found</span>
                </div>
                <span className="text-2xl font-bold text-white">{highRiskCount}</span>
              </div>
            </div>
          </div>

          <div className="glass-card p-6 rounded-xl">
            <h4 className="text-lg font-semibold text-white mb-3">Quick Info</h4>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Member Since</span>
                <span className="text-gray-300">2024</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Last Login</span>
                <span className="text-gray-300">Today</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Account Type</span>
                <span className="text-indigo-400 font-semibold">Free</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileView;