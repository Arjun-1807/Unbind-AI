"use client";

import React from "react";
import type { AnalysisResponse } from "@/types";
import { BookOpenIcon } from "./Icons";

interface KeyTermsViewProps {
  analysisResult: AnalysisResponse;
}

const KeyTermsView: React.FC<KeyTermsViewProps> = ({ analysisResult }) => {
  if (!analysisResult.keyTerms || analysisResult.keyTerms.length === 0) {
    return (
      <div>
        <h3 className="text-xl sm:text-2xl font-semibold text-ink mb-2">
          Key Terms Glossary
        </h3>
        <p className="text-ink-subtle">
          No specific legal terms were identified for a glossary in this
          document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center space-x-3">
          <BookOpenIcon className="h-7 w-7 text-primary flex-shrink-0" />
          <h3 className="text-xl sm:text-2xl font-semibold text-ink">
            Key Terms Glossary
          </h3>
        </div>
        <p className="text-ink-muted mt-2 max-w-3xl">
          Here are definitions for key legal terms found in your document,
          explained in plain English.
        </p>
      </div>
      <div className="space-y-4">
        {analysisResult.keyTerms.map((item, index) => (
          <div
            key={index}
            className="ln-card p-4"
          >
            <h4 className="font-semibold text-primary mb-1 break-words">
              {item.term}
            </h4>
            <p className="text-sm text-ink-muted leading-relaxed break-words">
              {item.definition}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyTermsView;
