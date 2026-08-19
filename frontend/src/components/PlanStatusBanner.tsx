"use client";

import React from "react";
import Link from "next/link";
import type { UserPlanStatus } from "@/services/api";

/**
 * How many days ahead of expiry to start warning.
 *
 * Brief and Motion are 30-day passes that do not auto-renew, so lapsing is the
 * normal end state rather than an edge case. Without a warning the first sign a
 * user gets is a quota refusal on a contract they were in the middle of — which
 * reads as the product breaking, not as a plan ending.
 */
const WARN_WITHIN_DAYS = 5;

function daysUntil(iso: string): number {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.ceil(ms / 86_400_000);
}

interface PlanStatusBannerProps {
  status: UserPlanStatus | null;
}

const PlanStatusBanner: React.FC<PlanStatusBannerProps> = ({ status }) => {
  if (!status) return null;

  // A plan that already ended. `lapsedPlan` is only set when the server saw a
  // stored plan whose expiry has passed, so this can't fire for a user who
  // never bought anything.
  if (status.lapsedPlan) {
    return (
      <div
        role="status"
        className="mb-6 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
      >
        <p className="text-sm text-ink">
          <span className="font-semibold">
            Your {status.lapsedPlan} plan has ended.
          </span>{" "}
          You&rsquo;re back on the free plan&rsquo;s daily limits. Plans
          don&rsquo;t renew automatically — buy again to pick up where you left
          off.
        </p>
        <Link
          href="/pricing"
          className="mt-3 inline-block shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 sm:mt-0"
        >
          View plans
        </Link>
      </div>
    );
  }

  // An active plan running out soon. A lifetime plan has no expiry, so this is
  // naturally skipped for Verdict.
  if (status.plan && status.expiresAt) {
    const remaining = daysUntil(status.expiresAt);
    if (remaining >= 0 && remaining <= WARN_WITHIN_DAYS) {
      return (
        <div
          role="status"
          className="mb-6 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 sm:flex sm:items-center sm:justify-between sm:gap-4"
        >
          <p className="text-sm text-ink">
            <span className="font-semibold">
              Your {status.plan} plan ends{" "}
              {remaining === 0
                ? "today"
                : remaining === 1
                  ? "tomorrow"
                  : `in ${remaining} days`}
              .
            </span>{" "}
            It won&rsquo;t renew on its own — renew now to keep your higher
            daily limits.
          </p>
          <Link
            href="/pricing"
            className="mt-3 inline-block shrink-0 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90 sm:mt-0"
          >
            Renew
          </Link>
        </div>
      );
    }
  }

  return null;
};

export default PlanStatusBanner;
