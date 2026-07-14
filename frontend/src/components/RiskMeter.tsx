"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ClauseAnalysis, RiskLevel } from "@/types";

interface RiskMeterProps {
  clauses: ClauseAnalysis[];
}

const RISK_WEIGHTS: { [key in RiskLevel]: number } = {
  [RiskLevel.High]: 3,
  [RiskLevel.Medium]: 2,
  [RiskLevel.Low]: 1,
  [RiskLevel.Negligible]: 0,
  [RiskLevel.NoRisk]: 0,
};

const getScoreColor = (score: number) => {
  if (score > 66) return "text-danger";
  if (score > 33) return "text-warning";
  return "text-success";
};

const getScoreLabel = (score: number) => {
  if (score > 80) return "Very High Risk";
  if (score > 60) return "High Risk";
  if (score > 40) return "Medium Risk";
  if (score > 20) return "Low to Medium Risk";
  if (score > 5) return "Low Risk";
  return "Very Low Risk";
};

const RiskMeter: React.FC<RiskMeterProps> = ({ clauses }) => {
  const [animatedScore, setAnimatedScore] = useState(0);

  const overallScore = useMemo(() => {
    if (!clauses || clauses.length === 0) return 0;
    const riskClauses = clauses.filter((c) => c.riskLevel !== RiskLevel.NoRisk);
    if (riskClauses.length === 0) return 0;
    const totalPossible = riskClauses.length * RISK_WEIGHTS.High;
    const actual = riskClauses.reduce(
      (acc, c) => acc + RISK_WEIGHTS[c.riskLevel],
      0,
    );
    return totalPossible > 0 ? (actual / totalPossible) * 100 : 0;
  }, [clauses]);

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedScore(overallScore), 100);
    return () => clearTimeout(timeout);
  }, [overallScore]);

  const rotation = (animatedScore / 100) * 180 - 90;

  return (
    <div className="flex flex-col items-center justify-center p-4 w-full max-w-xs">
      <div className="relative w-full">
        <svg viewBox="0 0 100 50" className="w-full">
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#4ade80"
            strokeWidth="10"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#facc15"
            strokeWidth="10"
            strokeDasharray="125.6"
            strokeDashoffset="41.8"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="#f87171"
            strokeWidth="10"
            strokeDasharray="125.6"
            strokeDashoffset="83.7"
          />
          <path
            d="M 10 50 A 40 40 0 0 1 90 50"
            fill="none"
            stroke="var(--color-hairline-strong, #374151)"
            strokeWidth="12"
            strokeLinecap="round"
          />
        </svg>
        <div
          className="absolute bottom-0 left-1/2 w-px h-[40%] origin-bottom transition-transform duration-1000 ease-in-out"
          style={{ transform: `translateX(-50%) rotate(${rotation}deg)` }}
        >
          <div className="w-1 h-full bg-ink rounded-t-full" />
        </div>
        <div className="absolute bottom-0 left-1/2 w-4 h-4 bg-ink border-2 border-canvas rounded-full transform -translate-x-1/2 translate-y-1/2" />
      </div>
      <div className="text-center mt-2">
        <div className={`text-3xl font-semibold ${getScoreColor(overallScore)}`}>
          {Math.round(overallScore)}
          <span className="text-xl text-ink-subtle">/100</span>
        </div>
        <div className="text-sm font-semibold text-ink-muted tracking-wider">
          {getScoreLabel(overallScore)}
        </div>
      </div>
    </div>
  );
};

export default RiskMeter;
