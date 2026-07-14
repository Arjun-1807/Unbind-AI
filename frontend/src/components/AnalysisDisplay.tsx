"use client";

import React, { useState } from "react";
import { TABS } from "@/constants";
import type { AnalysisResponse } from "@/types";
import RiskAnalysisView from "./RiskAnalysisView";
import NegotiationHelperView from "./NegotiationHelperView";
import KeyTermsView from "./KeyTermsView";
import KeyDatesView from "./KeyDatesView";
import ImpactSimulatorView from "./ImpactSimulatorView";
import ExportButton from "./ExportButton";
import DocumentView from "./DocumentView";

interface AnalysisDisplayProps {
  analysisResult: AnalysisResponse;
  documentText: string;
  onError: (message: string | null) => void;
  onBackToDashboard: () => void;
}

const AnalysisDisplay: React.FC<AnalysisDisplayProps> = ({
  analysisResult,
  documentText,
  onError,
  onBackToDashboard,
}) => {
  const [activeTab, setActiveTab] = useState(TABS.RISK_ANALYSIS);
  const [activeClauseIndex, setActiveClauseIndex] = useState<number | null>(
    null,
  );

  const renderTabContent = () => {
    const commonProps = {
      analysisResult,
      activeClauseIndex,
      setActiveClauseIndex,
    };
    switch (activeTab) {
      case TABS.RISK_ANALYSIS:
        return <RiskAnalysisView {...commonProps} />;
      case TABS.NEGOTIATION_HELPER:
        return <NegotiationHelperView {...commonProps} />;
      case TABS.KEY_TERMS_GLOSSARY:
        return <KeyTermsView analysisResult={analysisResult} />;
      case TABS.KEY_DATES:
        return <KeyDatesView analysisResult={analysisResult} />;
      case TABS.IMPACT_SIMULATOR:
        return (
          <ImpactSimulatorView
            documentText={documentText}
            onError={(msg) => onError(msg)}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="w-full fade-in">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
        <button
          onClick={onBackToDashboard}
          className="text-sm cursor-pointer text-primary hover:text-primary-hover transition-colors self-start"
        >
          &larr; Back to Dashboard
        </button>
        <ExportButton analysisResult={analysisResult} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-8">
        {/* Left Panel: Document View */}
        <div className="lg:col-span-2 lg:sticky top-28 self-start h-fit min-w-0">
          <h3 className="text-lg sm:text-xl font-semibold text-ink mb-4">
            Original Document
          </h3>
          <DocumentView
            documentText={documentText}
            clauses={analysisResult.clauses}
            activeClauseIndex={activeClauseIndex}
            setActiveClauseIndex={setActiveClauseIndex}
          />
        </div>

        {/* Right Panel: Analysis Tabs */}
        <div className="lg:col-span-3 min-w-0">
          <div className="mb-6 p-1.5 bg-surface-1 border border-hairline rounded-lg flex items-center space-x-1 overflow-x-auto">
            {Object.values(TABS).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap py-2 px-4 cursor-pointer rounded-md font-medium text-sm transition-colors duration-200
                  ${
                    activeTab === tab
                      ? "bg-primary text-white"
                      : "text-ink-muted hover:bg-surface-2 hover:text-ink"
                  }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="ln-card p-4 sm:p-6 md:p-8 min-h-[400px]">
            {renderTabContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnalysisDisplay;
