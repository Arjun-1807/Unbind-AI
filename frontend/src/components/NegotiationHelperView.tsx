"use client";

import React, { useState } from "react";
import type {
  AnalysisResponse,
  ClauseAnalysis,
  ModifiedClause,
  RiskLevel,
} from "@/types";
import { RISK_COLORS } from "@/constants";
import {
  CopyIcon,
  CheckCircleIcon,
  AlertCircleIcon,
  AlertTriangleIcon,
  ShieldCheckIcon,
} from "./Icons";
import OverlayRephrasedPdf from "./OverlayRephrasedPdf";

interface NegotiationHelperViewProps {
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
      return <CheckCircleIcon className="h-5 w-5 text-primary" />;
    default:
      return null;
  }
};

const ClauseModificationCard: React.FC<{
  clause: ClauseAnalysis;
  index: number;
  isActive: boolean;
  onHover: (index: number | null) => void;
  onClick: (index: number) => void;
  onModify: (
    index: number,
    choice: "keep_original" | "use_ai" | "use_custom",
    customText?: string,
  ) => void;
  modifiedClause?: ModifiedClause;
}> = ({
  clause,
  index,
  isActive,
  onHover,
  onClick,
  onModify,
  modifiedClause,
}) => {
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customText, setCustomText] = useState("");
  const [copied, setCopied] = useState(false);

  const colors = RISK_COLORS[clause.riskLevel] || RISK_COLORS.Negligible;
  const currentChoice = modifiedClause?.userChoice || "keep_original";
  const finalText = modifiedClause?.finalText || clause.clauseText;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(clause.negotiationSuggestion);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleChoice = (choice: "keep_original" | "use_ai" | "use_custom") => {
    if (choice === "use_custom") {
      setShowCustomInput(true);
    } else {
      let text = clause.clauseText;
      if (choice === "use_ai") {
        text = clause.suggestedRewrite || clause.clauseText;
      }
      onModify(index, choice, text);
    }
  };

  const handleCustomSubmit = () => {
    if (customText.trim()) {
      onModify(index, "use_custom", customText.trim());
      setShowCustomInput(false);
      setCustomText("");
    }
  };

  const handleCustomCancel = () => {
    setShowCustomInput(false);
    setCustomText("");
  };

  return (
    <div
      onMouseEnter={() => onHover(index)}
      onMouseLeave={() => onHover(null)}
      onClick={() => onClick(index)}
      className={`p-4 sm:p-5 rounded-lg border bg-surface-1 transition-all duration-300 cursor-pointer ${colors.border} ${isActive ? "ring-2 ring-primary" : ""}`}
    >
      {/* Header with Risk Level */}
      <div className="flex justify-between items-start gap-2 mb-4">
        <div
          className={`flex items-center space-x-2 font-semibold text-lg min-w-0 ${colors.text}`}
        >
          <RiskIcon riskLevel={clause.riskLevel} />
          <span>
            {clause.riskLevel === "No Risk"
              ? "No Risk"
              : `${clause.riskLevel} Risk`}
          </span>
        </div>
        {modifiedClause && (
          <span
            className={`px-2 py-1 text-xs font-medium rounded-full whitespace-nowrap flex-shrink-0 ${
              modifiedClause.userChoice === "keep_original"
                ? "bg-surface-2 text-ink-muted"
                : modifiedClause.userChoice === "use_ai"
                  ? "bg-success/10 text-success"
                  : "bg-primary/10 text-primary"
            }`}
          >
            {modifiedClause.userChoice === "keep_original"
              ? "Keep Original"
              : modifiedClause.userChoice === "use_ai"
                ? "AI Generated"
                : "Custom Text"}
          </span>
        )}
      </div>

      {/* Original Clause */}
      <div className="mb-4">
        <h4 className="font-semibold text-ink-muted mb-2">Original Clause</h4>
        <p className="text-sm text-ink-subtle font-mono break-words bg-surface-2 p-3 rounded-md">
          {clause.clauseText}
        </p>
      </div>

      {/* AI Suggestion */}
      <div className="mb-4">
        <div className="flex justify-between items-center gap-2 mb-2">
          <h4 className="font-semibold text-ink min-w-0">AI Suggestion</h4>
          <button
            onClick={handleCopy}
            className="inline-flex items-center flex-shrink-0 px-3 py-1.5 text-xs ln-btn-secondary"
          >
            {copied ? (
              <CheckCircleIcon className="mr-1.5 h-4 w-4 text-success" />
            ) : (
              <CopyIcon className="mr-1.5 h-4 w-4" />
            )}
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>
        <p className="text-sm text-ink-muted break-words mb-2">
          {clause.negotiationSuggestion}
        </p>
        {clause.suggestedRewrite && (
          <div className="text-sm text-ink-muted font-mono break-words bg-surface-2 p-3 rounded-md">
            <strong>Suggested Rewrite:</strong>
            <br />
            {clause.suggestedRewrite}
          </div>
        )}
      </div>

      {/* Choice Options */}
      <div className="mb-4">
        <h4 className="font-semibold text-ink-muted mb-3">
          Choose Your Option:
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleChoice("keep_original");
            }}
            className={`p-3 rounded-lg border transition-all ${
              currentChoice === "keep_original"
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-surface-1 text-ink-muted hover:border-hairline-strong"
            }`}
          >
            <div className="font-medium">Keep Original</div>
            <div className="text-xs text-ink-subtle mt-1">
              Use the original clause as-is
            </div>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleChoice("use_ai");
            }}
            className={`p-3 rounded-lg border transition-all ${
              currentChoice === "use_ai"
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-surface-1 text-ink-muted hover:border-hairline-strong"
            }`}
          >
            <div className="font-medium">Use AI Generated</div>
            <div className="text-xs text-ink-subtle mt-1">
              Use the AI&apos;s suggested rewrite
            </div>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              handleChoice("use_custom");
            }}
            className={`p-3 rounded-lg border transition-all ${
              currentChoice === "use_custom"
                ? "border-primary bg-primary/10 text-primary"
                : "border-hairline bg-surface-1 text-ink-muted hover:border-hairline-strong"
            }`}
          >
            <div className="font-medium">Use Custom</div>
            <div className="text-xs text-ink-subtle mt-1">
              Write your own version
            </div>
          </button>
        </div>
      </div>

      {/* Custom Input */}
      {showCustomInput && (
        <div className="mb-4 p-4 bg-surface-1 rounded-lg border border-hairline-strong">
          <h5 className="font-semibold text-primary mb-2">
            Write Your Custom Clause:
          </h5>
          <textarea
            value={customText}
            onChange={(e) => setCustomText(e.target.value)}
            placeholder="Enter your custom clause text here..."
            className="w-full h-32 p-3 ln-input"
            onClick={(e) => e.stopPropagation()}
          />
          <div className="flex gap-2 mt-3">
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCustomSubmit();
              }}
              className="px-4 py-2 ln-btn-primary"
            >
              OK
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCustomCancel();
              }}
              className="px-4 py-2 ln-btn-secondary"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Current Selection Display */}
      {modifiedClause && (
        <div className="mt-4 p-3 bg-surface-1 rounded-lg border border-hairline">
          <h5 className="font-semibold text-ink-muted mb-2">
            Selected Text (
            {modifiedClause.userChoice === "keep_original"
              ? "Keep Original"
              : modifiedClause.userChoice === "use_ai"
                ? "AI Generated"
                : "Custom Text"}
            ):
          </h5>
          <p className="text-sm text-ink-muted font-mono break-words bg-surface-2 p-2 rounded">
            {finalText}
          </p>
        </div>
      )}
    </div>
  );
};

const NegotiationHelperView: React.FC<NegotiationHelperViewProps> = ({
  analysisResult,
  activeClauseIndex,
  setActiveClauseIndex,
}) => {
  const [modifiedClauses, setModifiedClauses] = useState<
    Map<number, ModifiedClause>
  >(new Map());
  const [showPreview, setShowPreview] = useState(false);

  const riskClauses = analysisResult.clauses.filter(
    (clause) => clause.riskLevel !== "No Risk",
  );

  const handleCardClick = (index: number) => {
    const docClause = document.getElementById(`doc-clause-${index}`);
    docClause?.scrollIntoView({ behavior: "smooth", block: "center" });
    setActiveClauseIndex(index);
  };

  const handleModify = (
    index: number,
    choice: "keep_original" | "use_ai" | "use_custom",
    customText?: string,
  ) => {
    const clause = riskClauses[index];
    let finalText = clause.clauseText;
    let isModified = false;

    switch (choice) {
      case "use_ai":
        finalText = clause.suggestedRewrite || clause.clauseText;
        isModified = finalText !== clause.clauseText;
        break;
      case "use_custom":
        finalText = customText || clause.clauseText;
        isModified = finalText !== clause.clauseText;
        break;
      case "keep_original":
      default:
        finalText = clause.clauseText;
        isModified = false;
        break;
    }

    const modifiedClause: ModifiedClause = {
      ...clause,
      userChoice: choice,
      customText: customText,
      finalText: finalText,
      isModified: isModified,
    };

    setModifiedClauses((prev) => new Map(prev.set(index, modifiedClause)));
  };

  const buildRephrasedDraft = (): string => {
    return riskClauses
      .map((clause, i) => {
        const modified = modifiedClauses.get(i);
        const finalText = modified?.finalText || clause.clauseText;
        return `Clause ${i + 1}:\n${finalText}`;
      })
      .join("\n\n");
  };

  const buildCounterTips = (): string[] => {
    return riskClauses.map(
      (c, i) => `Clause ${i + 1}: ${c.negotiationSuggestion}`,
    );
  };

  const exportRephrasedPdf = async () => {
    const jspdf = await import("jspdf");
    const { jsPDF } = jspdf;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 48;
    let y = margin;

    const addTitle = (text: string) => {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(16);
      doc.text(text, margin, y);
      y += 18;
    };

    const addParagraph = (
      text: string,
      font: "normal" | "bold" = "normal",
      color: [number, number, number] = [0, 0, 0],
    ) => {
      doc.setFont("helvetica", font);
      doc.setFontSize(11);
      doc.setTextColor(color[0], color[1], color[2]);
      const lines = doc.splitTextToSize(text, pageWidth - margin * 2);
      lines.forEach((line: string) => {
        if (y + 14 > pageHeight - margin) {
          doc.addPage();
          y = margin;
        }
        doc.text(line, margin, y);
        y += 14;
      });
      y += 6;
    };

    const addSection = (title: string) => {
      if (y + 24 > pageHeight - margin) {
        doc.addPage();
        y = margin;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(0, 0, 0);
      doc.text(title, margin, y);
      y += 16;
    };

    addTitle("UnBind: User-Modified Contract");
    addSection("Clause Modifications");

    riskClauses.forEach((clause, i) => {
      const modified = modifiedClauses.get(i);
      const finalText = modified?.finalText || clause.clauseText;
      const userChoice = modified?.userChoice || "keep_original";

      addParagraph(`Clause ${i + 1} (${clause.riskLevel} Risk):`, "bold");

      let choiceText = "";
      let choiceColor: [number, number, number] = [0, 0, 0];

      switch (userChoice) {
        case "keep_original":
          choiceText = "[USER CHOICE: Keep Original]";
          choiceColor = [0, 100, 200];
          break;
        case "use_ai":
          choiceText = "[USER CHOICE: Use AI Generated]";
          choiceColor = [0, 150, 0];
          break;
        case "use_custom":
          choiceText = "[USER CHOICE: Use Custom Text]";
          choiceColor = [150, 0, 150];
          break;
      }

      addParagraph(choiceText, "bold", choiceColor);

      if (userChoice === "keep_original") {
        addParagraph(finalText, "normal", [0, 100, 200]);
        addParagraph("[Original text kept as-is]", "normal", [100, 100, 100]);
      } else if (userChoice === "use_ai") {
        addParagraph(finalText, "normal", [0, 150, 0]);
        addParagraph("[AI Suggested Rewrite]", "normal", [100, 100, 100]);
        if (finalText !== clause.clauseText) {
          addParagraph(
            `Original: ${clause.clauseText}`,
            "normal",
            [128, 128, 128],
          );
        }
      } else if (userChoice === "use_custom") {
        addParagraph(finalText, "normal", [150, 0, 150]);
        addParagraph("[Custom User Text]", "normal", [100, 100, 100]);
        if (finalText !== clause.clauseText) {
          addParagraph(
            `Original: ${clause.clauseText}`,
            "normal",
            [128, 128, 128],
          );
        }
      } else {
        addParagraph(finalText, "normal");
        addParagraph(
          "[No choice made - showing original]",
          "normal",
          [200, 100, 0],
        );
      }

      y += 15;
    });

    addSection("Negotiation Tips");
    buildCounterTips().forEach((tip) => addParagraph(`• ${tip}`));

    doc.save("UnBind-Modified-Contract.pdf");
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-xl sm:text-2xl font-semibold text-ink">
            Negotiation Helper
          </h3>
          <p className="text-ink-muted max-w-3xl">
            Review and modify risky clauses. Choose to keep the original, use AI
            suggestions, or write your own custom text.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:flex-shrink-0">
          <button
            type="button"
            onClick={() => setShowPreview((s) => !s)}
            className="inline-flex w-full sm:w-auto justify-center items-center px-4 py-2 text-sm ln-btn-secondary"
          >
            {showPreview ? "Hide Preview" : "Preview Modified Draft"}
          </button>
          <button
            type="button"
            onClick={exportRephrasedPdf}
            className="inline-flex w-full sm:w-auto justify-center items-center px-4 py-2 text-sm ln-btn-secondary"
          >
            Export Modified PDF
          </button>
        </div>
      </div>

      {showPreview && (
        <div className="ln-card p-4">
          <h4 className="font-semibold text-primary mb-2">
            Modified Contract Preview
          </h4>
          <pre className="whitespace-pre-wrap break-words text-sm text-ink-muted leading-relaxed">
            {buildRephrasedDraft()}
          </pre>
        </div>
      )}

      <div className="space-y-5">
        {riskClauses.map((clause, index) => (
          <ClauseModificationCard
            key={index}
            clause={clause}
            index={index}
            isActive={activeClauseIndex === index}
            onHover={setActiveClauseIndex}
            onClick={handleCardClick}
            onModify={handleModify}
            modifiedClause={modifiedClauses.get(index)}
          />
        ))}
      </div>

      <div className="pt-4">
        <OverlayRephrasedPdf analysisResult={analysisResult} />
      </div>
    </div>
  );
};

export default NegotiationHelperView;
