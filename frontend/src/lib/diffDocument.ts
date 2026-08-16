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

/**
 * The same normalization as `normalizeText`, but performed character by
 * character so every character of the result can be mapped back to the index
 * it came from in the original text. Re-normalizing one character at a time
 * cannot do this: `normalizeText(" ")` trims to `""`, so whitespace — which
 * the normalized haystack *does* contain — would not be counted, shifting
 * every mapped offset right by the number of preceding spaces.
 */
export const normalizeWithOffsets = (
  text: string,
): { normalized: string; offsets: number[] } => {
  const chars: string[] = [];
  const offsets: number[] = [];
  let prevWasSpace = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (/\s/.test(char)) {
      // `\s+` → a single space.
      if (!prevWasSpace) {
        chars.push(" ");
        offsets.push(i);
      }
      prevWasSpace = true;
      continue;
    }
    prevWasSpace = false;
    // Characters outside the allowed class are dropped. Note this happens
    // *after* whitespace collapsing, so a dropped character between two
    // spaces leaves both of them — matching normalizeText exactly.
    if (!/[\w.,;:!?()-]/.test(char)) continue;
    chars.push(char.toLowerCase());
    offsets.push(i);
  }

  // `.trim()` — drop the leading/trailing collapsed spaces and their offsets.
  let from = 0;
  let to = chars.length;
  while (from < to && chars[from] === " ") from++;
  while (to > from && chars[to - 1] === " ") to--;

  return {
    normalized: chars.slice(from, to).join(""),
    offsets: offsets.slice(from, to),
  };
};

/**
 * Locates `clauseText` inside `documentText` as exact character offsets into
 * the *original* text, skipping positions already claimed by another clause.
 * Falls back to a first-word/last-word span when the whole clause can't be
 * found verbatim. Shared with DocumentView so highlighting and rewriting
 * always agree on where a clause lives.
 */
export const findClauseInText = (
  clauseText: string,
  documentText: string,
  usedPositions: Set<number>,
): { start: number; end: number } | null => {
  const nc = normalizeText(clauseText);
  const { normalized: nd, offsets } = normalizeWithOffsets(documentText);

  // Maps a normalized [start, end) range back to original-text offsets.
  const toOriginalRange = (start: number, length: number) => ({
    start: offsets[start],
    end: offsets[Math.min(start + length, offsets.length) - 1] + 1,
  });

  const start = nc.length > 0 ? nd.indexOf(nc) : -1;
  if (start !== -1) {
    const { start: actualStart, end: actualEnd } = toOriginalRange(
      start,
      nc.length,
    );
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
    const li = fi === -1 ? -1 : nd.indexOf(lastWord, fi);
    if (fi !== -1 && li !== -1 && li > fi) {
      const actualStart = toOriginalRange(fi, firstWord.length).start;
      const actualEnd = toOriginalRange(li, lastWord.length).end;
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
const tokenizeLines = (text: string): string[] => text.match(/[^\n]*\n|[^\n]+/g) || [];

/** Appends `text`, coalescing it into the previous token when the op matches. */
const pushToken = (tokens: DiffToken[], op: DiffOp, text: string) => {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.op === op) last.text += text;
  else tokens.push({ op, text });
};

/**
 * Cap on LCS table cells (~16 MB of Uint32). The table is O(n×m), so without
 * a cap a 20k-word contract (~40k tokens per side) would ask for ~6.4 GB and
 * 1.6 billion iterations — enough to kill the tab.
 */
const MAX_LCS_CELLS = 4_000_000;

/**
 * LCS diff over two token arrays. Identical leading/trailing tokens are
 * matched off first — that alone reduces most document-sized comparisons to
 * the handful of tokens that actually changed. Returns null (rather than
 * allocating) when what remains is still too large for the table.
 */
const diffTokenArrays = (a: string[], b: string[]): DiffToken[] | null => {
  let lo = 0;
  while (lo < a.length && lo < b.length && a[lo] === b[lo]) lo++;
  let hiA = a.length;
  let hiB = b.length;
  while (hiA > lo && hiB > lo && a[hiA - 1] === b[hiB - 1]) {
    hiA--;
    hiB--;
  }

  const n = hiA - lo;
  const m = hiB - lo;
  if ((n + 1) * (m + 1) > MAX_LCS_CELLS) return null;

  // LCS length table
  const dp: Uint32Array[] = new Array(n + 1);
  for (let i = 0; i <= n; i++) dp[i] = new Uint32Array(m + 1);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[lo + i] === b[lo + j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const tokens: DiffToken[] = [];
  for (let k = 0; k < lo; k++) pushToken(tokens, "equal", a[k]);

  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[lo + i] === b[lo + j]) {
      pushToken(tokens, "equal", a[lo + i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      pushToken(tokens, "delete", a[lo + i]);
      i++;
    } else {
      pushToken(tokens, "insert", b[lo + j]);
      j++;
    }
  }
  while (i < n) pushToken(tokens, "delete", a[lo + i++]);
  while (j < m) pushToken(tokens, "insert", b[lo + j++]);

  for (let k = hiA; k < a.length; k++) pushToken(tokens, "equal", a[k]);
  return tokens;
};

/**
 * Computes a word-level diff between two texts using LCS, returning tokens
 * tagged as equal / delete (old-only) / insert (new-only) — the same shape
 * GitHub's split diff view highlights.
 *
 * Degrades gracefully on inputs too big for an exact word-level table: first
 * to a line-level diff, then to a whole-text replace. Normal-sized documents
 * always take the word-level path.
 */
export function diffWords(oldText: string, newText: string): DiffToken[] {
  const wordDiff = diffTokenArrays(tokenize(oldText), tokenize(newText));
  if (wordDiff) return wordDiff;

  const lineDiff = diffTokenArrays(tokenizeLines(oldText), tokenizeLines(newText));
  if (lineDiff) return lineDiff;

  const tokens: DiffToken[] = [];
  pushToken(tokens, "delete", oldText);
  pushToken(tokens, "insert", newText);
  return tokens;
}

/**
 * Diffs a segmented document without ever comparing it to itself end to end:
 * context runs are equal by construction, and only clauses whose rewrite is
 * being applied are diffed — each against its own rewrite. Output matches
 * `diffWords(documentText, applyDecisions(...))` for normal documents while
 * costing O(clause size) instead of O(document²).
 */
export function diffSegments(
  segments: DocSegment[],
  decisions: Record<number, ClauseDecision>,
): DiffToken[] {
  const tokens: DiffToken[] = [];
  segments.forEach((segment) => {
    if (segment.type === "context") {
      pushToken(tokens, "equal", segment.text);
      return;
    }
    if (decisions[segment.originalIndex] === "original") {
      pushToken(tokens, "equal", segment.original);
      return;
    }
    diffWords(segment.original, segment.rewrite).forEach((t) =>
      pushToken(tokens, t.op, t.text),
    );
  });
  return tokens;
}
