/**
 * A deliberately small Markdown subset parser for model answers.
 *
 * The models emit light Markdown whether or not you ask them to — `**bold**`
 * for the phrase that matters, `-` bullets for a list of conditions. Rendering
 * that as preformatted text put the raw asterisks on screen, which reads as a
 * bug in a product whose whole job is making dense documents legible.
 *
 * Why hand-rolled rather than a Markdown library:
 *
 * * It has to interleave with citations. `[S3]` markers become interactive
 *   chips, and they appear *inside* emphasis (`**capped at 2% [S3]**`), so the
 *   citation pass cannot simply run before or after a Markdown pass — the two
 *   have to share one tokenizer.
 * * The output is untrusted. A parser that produces a data structure, rendered
 *   into React elements, has no HTML-injection surface at all; a library that
 *   hands back an HTML string would need sanitising, and the safe path there is
 *   easy to get subtly wrong.
 * * The supported subset is tiny and fixed by the system prompt.
 *
 * Anything unrecognised — a stray asterisk, an unclosed backtick, a table —
 * falls through as literal text rather than being swallowed.
 */

export type Inline =
  | { type: "text"; value: string }
  | { type: "bold"; children: Inline[] }
  | { type: "italic"; children: Inline[] }
  | { type: "code"; value: string }
  | { type: "break" }
  /** `raw` is kept so a marker with no matching source can render verbatim. */
  | { type: "cite"; id: number; raw: string };

export type Block =
  | { type: "paragraph"; children: Inline[] }
  | { type: "list"; ordered: boolean; items: Inline[][] }
  | { type: "heading"; level: number; children: Inline[] };

// `**` and `__` before `*` so the longer delimiter always wins. Single `_` is
// deliberately NOT italic: it would mangle snake_case identifiers and file
// names, which show up in contracts far more often than underscore emphasis.
const INLINE_RE =
  /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\*([^*\n]+?)\*|`([^`\n]+?)`|\[S(\d+)\]/g;

const BULLET_RE = /^\s*[-*•]\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*)$/;

/** Emphasis can nest; cap the depth so pathological input cannot recurse away. */
const MAX_DEPTH = 4;

function pushText(out: Inline[], value: string): void {
  if (!value) return;
  const last = out[out.length - 1];
  if (last?.type === "text") last.value += value;
  else out.push({ type: "text", value });
}

/** Tokenise one line's worth of text. Exported for tests. */
export function parseInline(text: string, depth = 0): Inline[] {
  const out: Inline[] = [];
  if (depth >= MAX_DEPTH) {
    pushText(out, text);
    return out;
  }

  // Drain every match BEFORE recursing. INLINE_RE is a module-level /g regex,
  // so its `lastIndex` is shared state: recursing into emphasis contents mid-
  // scan resets it to 0 and the outer loop starts the same string over, for
  // ever. Collecting first means each depth finishes with the regex before the
  // next depth touches it.
  INLINE_RE.lastIndex = 0;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = INLINE_RE.exec(text)) !== null) {
    matches.push(match);
    // A zero-width match would never advance; nudge past it.
    if (match[0] === "") INLINE_RE.lastIndex += 1;
  }

  let last = 0;
  for (const m of matches) {
    if (m.index > last) pushText(out, text.slice(last, m.index));

    const [full, bold, boldAlt, italic, code, citeId] = m;
    if (bold !== undefined || boldAlt !== undefined) {
      out.push({ type: "bold", children: parseInline((bold ?? boldAlt)!, depth + 1) });
    } else if (italic !== undefined) {
      out.push({ type: "italic", children: parseInline(italic, depth + 1) });
    } else if (code !== undefined) {
      out.push({ type: "code", value: code });
    } else if (citeId !== undefined) {
      out.push({ type: "cite", id: parseInt(citeId, 10), raw: full });
    }

    last = m.index + full.length;
  }

  if (last < text.length) pushText(out, text.slice(last));
  return out;
}

/** Join paragraph lines, preserving the model's soft line breaks. */
function paragraphFrom(lines: string[]): Block {
  const children: Inline[] = [];
  lines.forEach((line, i) => {
    if (i > 0) children.push({ type: "break" });
    children.push(...parseInline(line));
  });
  return { type: "paragraph", children };
}

/**
 * Split an answer into renderable blocks.
 *
 * Recognises paragraphs, `-`/`*`/`•` bullets, `1.` ordered lists and ATX
 * headings. A blank line ends the current block; a change of block kind ends it
 * too, so a list immediately following prose does not swallow the prose.
 */
export function parseAnswer(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, "\n").split("\n");

  let paragraph: string[] = [];
  let items: string[] = [];
  let ordered = false;

  const flushParagraph = () => {
    if (paragraph.length) {
      blocks.push(paragraphFrom(paragraph));
      paragraph = [];
    }
  };
  const flushList = () => {
    if (items.length) {
      blocks.push({
        type: "list",
        ordered,
        items: items.map((item) => parseInline(item)),
      });
      items = [];
    }
  };
  const flushAll = () => {
    flushParagraph();
    flushList();
  };

  for (const line of lines) {
    if (!line.trim()) {
      flushAll();
      continue;
    }

    const heading = HEADING_RE.exec(line);
    if (heading) {
      flushAll();
      blocks.push({
        type: "heading",
        level: heading[1].length,
        children: parseInline(heading[2]),
      });
      continue;
    }

    const bullet = BULLET_RE.exec(line);
    if (bullet) {
      flushParagraph();
      if (items.length && ordered) flushList();
      ordered = false;
      items.push(bullet[1]);
      continue;
    }

    const numbered = ORDERED_RE.exec(line);
    if (numbered) {
      flushParagraph();
      if (items.length && !ordered) flushList();
      ordered = true;
      items.push(numbered[1]);
      continue;
    }

    flushList();
    paragraph.push(line.trim());
  }

  flushAll();
  return blocks;
}
