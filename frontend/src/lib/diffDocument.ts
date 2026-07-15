import type { ClauseAnalysis } from "@/types";

// ─── Clause matching (mirrors DocumentView's normalize/locate logic) ───────

const normalizeText = (text: string) =>
  text
    .replace(/\s+/g, " ")
    .replace(/[^\w\s.,;:!?()-]/g, "")
    .toLowerCase()
    .trim();

// The backend prompts the model to literally write phrases like "No changes
// needed" into suggestedRewrite for No-Risk clauses — that's a sentinel
// meaning "don't rewrite this", not real replacement text. Recognize it so
// it's never spliced into the document.
const NO_OP_REWRITE_PATTERN =
  /^(no\s+changes?\s+(needed|required|necessary)|n\/a|none|not\s+applicable)\.?$/i;

const isNoOpRewrite = (rewrite: string) =>
  NO_OP_REWRITE_PATTERN.test(rewrite.trim());

const findActualPosition = (
  originalText: string,
  normalizedIndex: number,
): number => {
  let originalIndex = 0;
  let normalizedIndexCount = 0;
  for (
    let i = 0;
    i < originalText.length && normalizedIndexCount < normalizedIndex;
    i++
  ) {
    const nc = normalizeText(originalText[i]);
    if (nc) normalizedIndexCount++;
    originalIndex = i;
  }
  return originalIndex;
};

const findClauseInText = (
  clauseText: string,
  documentText: string,
  usedPositions: Set<number>,
): { start: number; end: number } | null => {
  const nc = normalizeText(clauseText);
  const nd = normalizeText(documentText);

  const start = nd.indexOf(nc);
  if (start !== -1) {
    const actualStart = findActualPosition(documentText, start);
    const actualEnd = actualStart + clauseText.length;
    if (!usedPositions.has(actualStart)) {
      usedPositions.add(actualStart);
      return { start: actualStart, end: actualEnd };
    }
  }

  const clauseWords = nc.split(" ").filter((w) => w.length > 3);
  if (clauseWords.length > 0) {
    const firstWord = clauseWords[0];
    const lastWord = clauseWords[clauseWords.length - 1];
    const fi = nd.indexOf(firstWord);
    const li = nd.indexOf(lastWord, fi);
    if (fi !== -1 && li !== -1 && li > fi) {
      const actualStart = findActualPosition(documentText, fi);
      const actualEnd = findActualPosition(documentText, li) + lastWord.length;
      if (!usedPositions.has(actualStart)) {
        usedPositions.add(actualStart);
        return { start: actualStart, end: actualEnd };
      }
    }
  }
  return null;
};

/** A run of plain, un-attributable document text between/around clauses. */
export interface ContextSegment {
  type: "context";
  text: string;
}

/** A clause with a located, non-trivial AI rewrite — eligible for accept/reject. */
export interface ClauseSegment {
  type: "clause";
  originalIndex: number;
  original: string;
  rewrite: string;
}

export type DocSegment = ContextSegment | ClauseSegment;

/**
 * Splits the document into an ordered list of segments: plain context runs,
 * and clause segments wherever a clause has a suggested rewrite that was
 * successfully located in the text and actually differs from the original.
 * Segments are the basis for both the default "revised" document and for
 * per-clause accept/reject reconstruction (see `applyDecisions`).
 */
export function buildDocumentSegments(
  documentText: string,
  clauses: ClauseAnalysis[],
): { segments: DocSegment[]; unmatchedCount: number } {
  if (!documentText || !clauses || clauses.length === 0) {
    return { segments: [{ type: "context", text: documentText }], unmatchedCount: 0 };
  }

  const usedPositions = new Set<number>();
  const matched: Array<{
    originalIndex: number;
    start: number;
    end: number;
    original: string;
    rewrite: string;
  }> = [];
  let unmatchedCount = 0;

  clauses.forEach((clause, index) => {
    if (!clause.suggestedRewrite || !clause.suggestedRewrite.trim()) return;
    if (!clause.clauseText || !clause.clauseText.trim()) return;
    // A rewrite that's word-for-word identical to the original isn't a real
    // change — don't surface it as one, and don't spend a match slot on it.
    if (normalizeText(clause.suggestedRewrite) === normalizeText(clause.clauseText)) {
      return;
    }
    // Sentinel "no change" phrasing (see NO_OP_REWRITE_PATTERN) isn't
    // replacement text either — skip so the original text is kept as-is.
    if (isNoOpRewrite(clause.suggestedRewrite)) {
      return;
    }
    const match = findClauseInText(clause.clauseText, documentText, usedPositions);
    if (match) {
      matched.push({
        originalIndex: index,
        ...match,
        original: clause.clauseText,
        rewrite: clause.suggestedRewrite,
      });
    } else {
      unmatchedCount++;
    }
  });

  const sorted = matched.sort((a, b) => a.start - b.start);
  const segments: DocSegment[] = [];
  let lastIndex = 0;

  sorted.forEach((m) => {
    if (m.start > lastIndex) {
      segments.push({ type: "context", text: documentText.substring(lastIndex, m.start) });
    }
    segments.push({
      type: "clause",
      originalIndex: m.originalIndex,
      original: m.original,
      rewrite: m.rewrite,
    });
    lastIndex = m.end;
  });
  if (lastIndex < documentText.length) {
    segments.push({ type: "context", text: documentText.substring(lastIndex) });
  }

  return { segments, unmatchedCount };
}

export type ClauseDecision = "original" | "ai";

/**
 * Reconstructs document text from segments, using `decisions` to pick
 * original-vs-rewrite per clause (defaults to the AI rewrite when a clause
 * has no explicit decision).
 */
export function applyDecisions(
  segments: DocSegment[],
  decisions: Record<number, ClauseDecision>,
): string {
  return segments
    .map((s) =>
      s.type === "context"
        ? s.text
        : decisions[s.originalIndex] === "original"
          ? s.original
          : s.rewrite,
    )
    .join("");
}

// ─── Word-level diff (Myers-ish LCS) for GitHub-style highlighting ─────────

export type DiffOp = "equal" | "delete" | "insert";

export interface DiffToken {
  op: DiffOp;
  text: string;
}

const tokenize = (text: string): string[] => text.match(/\S+|\s+/g) || [];

/**
 * Computes a word-level diff between two texts using LCS, returning tokens
 * tagged as equal / delete (old-only) / insert (new-only) — the same shape
 * GitHub's split diff view highlights.
 */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  const a = tokenize(oldText);
  const b = tokenize(newText);
  const n = a.length;
  const m = b.length;

  // LCS length table
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  const push = (op: DiffOp, text: string) => {
    const last = tokens[tokens.length - 1];
    if (last && last.op === op) last.text += text;
    else tokens.push({ op, text });
  };

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      push("equal", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      push("delete", a[i]);
      i++;
    } else {
      push("insert", b[j]);
      j++;
    }
  }
  while (i < n) push("delete", a[i++]);
  while (j < m) push("insert", b[j++]);

  return tokens;
}
