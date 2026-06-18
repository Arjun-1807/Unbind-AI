"use client";

import React from "react";
import type { AnalysisResponse } from "@/types";
import { DownloadIcon } from "./Icons";

interface ExportButtonProps {
  analysisResult: AnalysisResponse;
}

const ExportButton: React.FC<ExportButtonProps> = ({ analysisResult }) => {
  const handleExport = async () => {
    const jspdf = await import("jspdf");
    const { jsPDF } = jspdf;
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height;
    let y = 20;

    const checkY = (spaceNeeded: number) => {
      if (y + spaceNeeded > pageHeight - 20) {
        doc.addPage();
        y = 20;
      }
    };

    // Title
    doc.setFontSize(22);
    doc.setFont("helvetica", "bold");
    doc.text("UnBind AI Legal Analysis Report", 105, y, { align: "center" });
    y += 15;

    // Summary
    doc.setFontSize(16);
    doc.text("Contract Summary", 14, y);
    y += 8;
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    const summaryLines = doc.splitTextToSize(analysisResult.summary, 180);
    doc.text(summaryLines, 14, y);
    y += summaryLines.length * 5 + 10;

    // Missing Clauses
    if (
      analysisResult.missingClauses &&
      analysisResult.missingClauses.length > 0
    ) {
      checkY(20);
      doc.setFontSize(16);
      doc.setFont("helvetica", "bold");
      doc.text("Potentially Missing Clauses", 14, y);
      y += 10;

      analysisResult.missingClauses.forEach((clause) => {
        checkY(20);
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text(clause.clauseName, 14, y);
        y += 6;

        doc.setFontSize(10);
        doc.setFont("helvetica", "normal");
        const reasonLines = doc.splitTextToSize(clause.reason, 170);
        doc.text(reasonLines, 16, y);
        y += reasonLines.length * 5 + 5;
      });
      y += 5;
    }

    // Clause Analysis
    checkY(20);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("Clause-by-Clause Analysis", 14, y);
    y += 10;

    analysisResult.clauses.forEach((clause, index) => {
      const sectionHeight =
        50 + doc.splitTextToSize(clause.clauseText, 170).length * 5;
      checkY(sectionHeight);

      doc.setFontSize(12);
      doc.setFont("helvetica", "bold");
      doc.text(
        `Clause ${index + 1}: ${clause.riskLevel === "No Risk" ? "No Risk" : `${clause.riskLevel} Risk`}`,
        14,
        y,
      );
      y += 7;

      doc.setFontSize(10);
      doc.setFont("helvetica", "normal");

      doc.setFont("helvetica", "bold");
      doc.text("Original Text:", 16, y);
      y += 5;
      doc.setFont("courier", "normal");
      const originalLines = doc.splitTextToSize(clause.clauseText, 170);
      doc.text(originalLines, 18, y);
      y += originalLines.length * 4 + 5;

      doc.setFont("helvetica", "bold");
      doc.text("Explanation:", 16, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const explanationLines = doc.splitTextToSize(
        clause.simplifiedExplanation,
        170,
      );
      doc.text(explanationLines, 18, y);
      y += explanationLines.length * 4 + 5;

      doc.setFont("helvetica", "bold");
      doc.text("Risk:", 16, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      const riskLines = doc.splitTextToSize(clause.riskReason, 170);
      doc.text(riskLines, 18, y);
      y += riskLines.length * 4 + 10;
    });

    doc.save("UnBind-Analysis-Report.pdf");
  };

  return (
    <button
      onClick={handleExport}
      className="inline-flex cursor-pointer items-center px-4 py-2 text-sm font-medium text-indigo-300 bg-indigo-900/40 border border-indigo-500/50 rounded-md hover:bg-indigo-900/70 transition-colors"
    >
      <DownloadIcon className="mr-2 h-4 w-4" />
      Export PDF
    </button>
  );
};

export default ExportButton;
