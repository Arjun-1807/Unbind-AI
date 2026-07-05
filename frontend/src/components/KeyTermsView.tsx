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
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Key Terms Glossary
        </h3>
        <p className="text-gray-400">
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
          <BookOpenIcon className="h-7 w-7 text-indigo-400 flex-shrink-0" />
          <h3 className="text-xl sm:text-2xl font-bold text-white">
            Key Terms Glossary
          </h3>
        </div>
        <p className="text-gray-300 mt-2 max-w-3xl">
          Here are definitions for key legal terms found in your document,
          explained in plain English.
        </p>
      </div>
      <div className="space-y-4">
        {analysisResult.keyTerms.map((item, index) => (
          <div
            key={index}
            className="p-4 rounded-lg bg-gray-900/50 border border-gray-700"
          >
            <h4 className="font-semibold text-indigo-300 mb-1 break-words">
              {item.term}
            </h4>
            <p className="text-sm text-gray-200 leading-relaxed break-words">
              {item.definition}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyTermsView;
