"use client";

import React from "react";
import type {
  AnalysisResponse,
  ClauseAnalysis,
  MissingClause,
  RiskLevel,
} from "@/types";
import { RISK_COLORS } from "@/constants";
import {
  CheckCircleIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  AlertCircleIcon,
  FileSearchIcon,
} from "./Icons";
import RiskMeter from "./RiskMeter";

interface RiskAnalysisViewProps {
  analysisResult: AnalysisResponse;
  activeClauseIndex: number | null;
  setActiveClauseIndex: (index: number | null) => void;
}

const RiskIcon = ({ riskLevel }: { riskLevel: RiskLevel }) => {
  switch (riskLevel) {
    case "High":
      return <AlertCircleIcon className="h-5 w-5 text-danger" />;
    case "Medium":
      return <AlertTriangleIcon className="h-5 w-5 text-warning" />;
    case "Low":
      return <ShieldCheckIcon className="h-5 w-5 text-success" />;
    case "Negligible":
      return <CheckCircleIcon className="h-5 w-5 text-blue-300" />;
    case "No Risk":
      return <CheckCircleIcon className="h-5 w-5 text-ink-subtle" />;
    default:
      return null;
  }
};

const ClauseCard: React.FC<{
  clause: ClauseAnalysis;
  index: number;
  isActive: boolean;
  onHover: (index: number | null) => void;
  onClick: (index: number) => void;
}> = ({ clause, index, isActive, onHover, onClick }) => {
  const colors = RISK_COLORS[clause.riskLevel] || RISK_COLORS.Negligible;
  return (
    <div
      id={`clause-card-${index}`}
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(index)}
      className={`p-4 sm:p-5 rounded-lg border bg-surface-1 transition-all duration-300 cursor-pointer ${colors.border} ${isActive ? "ring-2 ring-primary" : "hover:bg-surface-2"}`}
    >
      <div className="flex justify-between items-start mb-3">
        <div
          className={`flex items-center space-x-2 font-semibold text-base sm:text-lg ${colors.text}`}
        >
          <RiskIcon riskLevel={clause.riskLevel} />
          <span>
            {clause.riskLevel === "No Risk"
              ? "No Risk"
              : `${clause.riskLevel} Risk`}
          </span>
        </div>
      </div>
      <div className="space-y-4">
        <div>
          <h4 className="font-semibold text-ink-muted mb-1">Original Clause</h4>
          <p className="text-sm text-ink-subtle font-mono bg-canvas p-3 rounded-md border border-hairline break-words">
            {clause.clauseText}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-ink-muted mb-1">
            Simplified Explanation
          </h4>
          <p className="text-sm text-ink-muted">
            {clause.simplifiedExplanation}
          </p>
        </div>
        <div>
          <h4 className="font-semibold text-ink-muted mb-1">Potential Risk</h4>
          <p className="text-sm text-ink-muted">{clause.riskReason}</p>
        </div>
      </div>
    </div>
  );
};

const MissingClauseCard: React.FC<{ clause: MissingClause }> = ({ clause }) => {
  const colors = RISK_COLORS.Medium;
  return (
    <div
      className={`p-4 rounded-lg bg-warning/10 border ${colors.border}`}
    >
      <h4 className="font-semibold text-warning mb-1">
        {clause.clauseName}
      </h4>
      <p className="text-sm text-ink-muted">{clause.reason}</p>
    </div>
  );
};

const RiskAnalysisView: React.FC<RiskAnalysisViewProps> = ({
  analysisResult,
  activeClauseIndex,
  setActiveClauseIndex,
}) => {
  const hasMissingClauses =
    analysisResult.missingClauses && analysisResult.missingClauses.length > 0;

  const handleCardClick = (index: number) => {
    const docClause = document.getElementById(`doc-clause-${index}`);
    docClause?.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveClauseIndex(index);
  };

  return (
    <div className="space-y-8 sm:space-y-10">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 items-center">
        <div className="md:col-span-1 flex items-center justify-center">
          <RiskMeter clauses={analysisResult.clauses} />
        </div>
        <div className="md:col-span-2 min-w-0">
          <h3 className="text-xl sm:text-2xl font-semibold text-ink mb-4">
            Contract Summary
          </h3>
          <p className="text-ink-muted leading-relaxed break-words">
            {analysisResult.summary}
          </p>
        </div>
      </div>

      {hasMissingClauses && (
        <div>
          <div className="flex items-center space-x-3 mb-4">
            <FileSearchIcon className="h-7 w-7 shrink-0 text-warning" />
            <h3 className="text-xl sm:text-2xl font-semibold text-ink">
              Potentially Missing Clauses
            </h3>
          </div>
          <p className="text-ink-muted mb-6 max-w-3xl">
            The AI has identified standard clauses that are often found in this
            type of document but seem to be missing.
          </p>
          <div className="space-y-4">
            {analysisResult.missingClauses.map((clause, index) => (
              <MissingClauseCard key={index} clause={clause} />
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl sm:text-2xl font-semibold text-ink">
            Clause-by-Clause Breakdown
          </h3>
        </div>
        <div className="space-y-5">
          {analysisResult.clauses.map((clause, index) => (
            <ClauseCard
              key={index}
              clause={clause}
              index={index}
              isActive={activeClauseIndex === index}
              onHover={setActiveClauseIndex}
              onClick={handleCardClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default RiskAnalysisView;
