import { describe, expect, it } from "vitest";

import {
  buildDocumentSegments,
  diffWords,
  findClauseInText,
  normalizeWithOffsets,
} from "@/lib/diffDocument";
import { RiskLevel, type ClauseAnalysis } from "@/types";

const normalizeText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s.,;:!?()-]/g, "")
    .toLowerCase()
    .trim();

const clause = (
  clauseText: string,
  suggestedRewrite: string,
): ClauseAnalysis => ({
  clauseText,
  suggestedRewrite,
  simplifiedExplanation: "",
  riskLevel: RiskLevel.High,
  riskReason: "",
  negotiationSuggestion: "",
});

describe("diffWords", () => {
  it("marks everything equal when the texts are identical", () => {
    const tokens = diffWords("the quick brown fox", "the quick brown fox");
    expect(tokens.every((t) => t.op === "equal")).toBe(true);
    expect(tokens.map((t) => t.text).join("")).toBe("the quick brown fox");
  });

  it("reconstructs the old text from equal + delete tokens", () => {
    const oldText = "the quick fox";
    const newText = "the slow fox";
    const tokens = diffWords(oldText, newText);
    const rebuiltOld = tokens
      .filter((t) => t.op !== "insert")
      .map((t) => t.text)
      .join("");
    expect(rebuiltOld).toBe(oldText);
  });

  it("reconstructs the new text from equal + insert tokens", () => {
    const oldText = "the quick fox";
    const newText = "the slow fox";
    const tokens = diffWords(oldText, newText);
    const rebuiltNew = tokens
      .filter((t) => t.op !== "delete")
      .map((t) => t.text)
      .join("");
    expect(rebuiltNew).toBe(newText);
  });

  it("emits an insert when text is only added", () => {
    const tokens = diffWords("hello", "hello world");
    expect(tokens.some((t) => t.op === "insert")).toBe(true);
    expect(tokens.some((t) => t.op === "delete")).toBe(false);
  });

  it("stays bounded on document-sized inputs instead of building an O(n×m) table", () => {
    // ~40k word tokens per side: the old full LCS table would have asked for
    // ~6.4 GB. Only the middle sentence differs, so the bounded path must
    // finish near-instantly and still pinpoint the change.
    const filler = "the parties hereby agree to the terms set forth herein. ".repeat(
      2000,
    );
    const oldText = `${filler}THE VENDOR SHALL INDEMNIFY THE CLIENT.${filler}`;
    const newText = `${filler}THE VENDOR SHALL NOT INDEMNIFY THE CLIENT.${filler}`;

    const started = Date.now();
    const tokens = diffWords(oldText, newText);
    expect(Date.now() - started).toBeLessThan(2000);

    expect(tokens.filter((t) => t.op !== "insert").map((t) => t.text).join("")).toBe(
      oldText,
    );
    expect(tokens.filter((t) => t.op !== "delete").map((t) => t.text).join("")).toBe(
      newText,
    );
    // The change is localized, not a whole-document replace.
    const changed = tokens.filter((t) => t.op !== "equal");
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.map((t) => t.text).join("").length).toBeLessThan(100);
  });
});

describe("normalizeWithOffsets", () => {
  it("produces exactly the same string as the plain normalizer", () => {
    const samples = [
      "  Leading and   trailing   ",
      "Mixed\nWhitespace\tRuns",
      "Strip * these ** symbols # out",
      "SECTION 1.2 — (a) Payment; terms: net-30!",
      "",
    ];
    samples.forEach((sample) => {
      expect(normalizeWithOffsets(sample).normalized).toBe(normalizeText(sample));
    });
  });

  it("maps every normalized character back to its original index", () => {
    const text = "  Hello,   *world*  ";
    const { normalized, offsets } = normalizeWithOffsets(text);
    expect(offsets).toHaveLength(normalized.length);
    offsets.forEach((offset, i) => {
      const original = text[offset];
      expect(normalized[i]).toBe(/\s/.test(original) ? " " : original.toLowerCase());
    });
  });
});

describe("findClauseInText", () => {
  it("returns the true offset of a clause preceded by spaces", () => {
    // Regression: findActualPosition used to skip whitespace when counting
    // normalized characters, so this clause — which really starts at 42 —
    // was reported at 51 and the slice began mid-word ("LAUSE says...").
    const prefix = "This is a preamble with some plain words. ";
    const clauseText = "THE BAD CLAUSE says you owe everything.";
    const documentText = `${prefix}${clauseText} And then more text follows.`;
    expect(prefix.length).toBe(42);

    const match = findClauseInText(clauseText, documentText, new Set());
    expect(match).not.toBeNull();
    expect(match!.start).toBe(documentText.indexOf(clauseText));
    expect(documentText.substring(match!.start, match!.end)).toBe(clauseText);
  });

  it("locates a clause across collapsed multi-space and newline runs", () => {
    const documentText =
      "Preamble   with    irregular\n\n spacing.\n\nThe Company    may terminate\nat  will.\n\nTrailing note.";
    const clauseText = "The Company may terminate at will.";

    const match = findClauseInText(clauseText, documentText, new Set());
    expect(match).not.toBeNull();
    const slice = documentText.substring(match!.start, match!.end);
    expect(slice.startsWith("The Company")).toBe(true);
    expect(slice.endsWith("will.")).toBe(true);
    expect(normalizeText(slice)).toBe(normalizeText(clauseText));
  });
});

describe("buildDocumentSegments", () => {
  it("splices rewrites at the correct offsets without corrupting context text", () => {
    const documentText =
      "Intro paragraph here. The Client waives all claims. Closing paragraph here.";
    const { segments, unmatchedCount } = buildDocumentSegments(documentText, [
      clause("The Client waives all claims.", "The Client retains all claims."),
    ]);

    expect(unmatchedCount).toBe(0);
    expect(segments).toEqual([
      { type: "context", text: "Intro paragraph here. " },
      {
        type: "clause",
        originalIndex: 0,
        original: "The Client waives all claims.",
        rewrite: "The Client retains all claims.",
      },
      { type: "context", text: " Closing paragraph here." },
    ]);
  });

  it("reproduces the document exactly when every clause keeps its original", () => {
    const documentText =
      "One. The Client waives all claims. Two. Fees are non-refundable. Three.";
    const { segments } = buildDocumentSegments(documentText, [
      clause("The Client waives all claims.", "The Client retains all claims."),
      clause("Fees are non-refundable.", "Fees are refundable pro rata."),
    ]);

    const rebuilt = segments
      .map((s) => (s.type === "context" ? s.text : s.original))
      .join("");
    expect(rebuilt).toBe(documentText);
  });
});
