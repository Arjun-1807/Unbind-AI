import { describe, expect, it } from "vitest";
import { parseAnswer, parseInline, type Inline } from "./answerMarkdown";

/** Flatten to plain text so assertions read as the sentence the user sees. */
const flatten = (nodes: Inline[]): string =>
  nodes
    .map((n) => {
      switch (n.type) {
        case "text":
          return n.value;
        case "code":
          return n.value;
        case "break":
          return "\n";
        case "cite":
          return `<cite:${n.id}>`;
        default:
          return flatten(n.children);
      }
    })
    .join("");

describe("parseInline", () => {
  it("turns **…** into bold and drops the delimiters", () => {
    const nodes = parseInline("You pay a **2% penalty** on prepayment.");
    expect(nodes.map((n) => n.type)).toEqual(["text", "bold", "text"]);
    expect(flatten(nodes)).toBe("You pay a 2% penalty on prepayment.");
  });

  it("treats __…__ as bold too", () => {
    expect(parseInline("__capped__")[0].type).toBe("bold");
  });

  it("reads single asterisks as italic", () => {
    expect(parseInline("that is *before* twelve EMIs")[1].type).toBe("italic");
  });

  it("leaves underscores inside words alone", () => {
    // snake_case survives far more often than underscore emphasis is meant.
    const nodes = parseInline("see clause_2 and clause_3");
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({ type: "text", value: "see clause_2 and clause_3" });
  });

  it("extracts citation markers with their id", () => {
    const nodes = parseInline("No penalty after twelve EMIs [S1].");
    expect(nodes[1]).toEqual({ type: "cite", id: 1, raw: "[S1]" });
  });

  it("finds citations nested inside emphasis", () => {
    // The reason Markdown and citations share one tokenizer rather than
    // running as two passes.
    const nodes = parseInline("**capped at 2% [S3]**");
    expect(nodes[0].type).toBe("bold");
    const bold = nodes[0] as Extract<Inline, { type: "bold" }>;
    expect(bold.children.some((c) => c.type === "cite" && c.id === 3)).toBe(true);
  });

  it("keeps unmatched delimiters as literal text", () => {
    expect(flatten(parseInline("2 * 3 = 6"))).toBe("2 * 3 = 6");
    expect(flatten(parseInline("an unclosed **bold"))).toBe("an unclosed **bold");
  });

  it("handles inline code", () => {
    const nodes = parseInline("the `prepayment` clause");
    expect(nodes[1]).toEqual({ type: "code", value: "prepayment" });
  });
});

describe("parseAnswer", () => {
  it("groups dash bullets into one list", () => {
    const blocks = parseAnswer("- first thing\n- second thing\n- third thing");
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("list");
    const list = blocks[0] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(list.ordered).toBe(false);
    expect(list.items).toHaveLength(3);
    expect(flatten(list.items[1])).toBe("second thing");
  });

  it("recognises numbered lists separately from bullets", () => {
    const blocks = parseAnswer("1. one\n2. two\n\n- bullet");
    expect(blocks.map((b) => b.type)).toEqual(["list", "list"]);
    const [first, second] = blocks as Extract<
      (typeof blocks)[number],
      { type: "list" }
    >[];
    expect(first.ordered).toBe(true);
    expect(second.ordered).toBe(false);
  });

  it("does not let a list swallow the prose above it", () => {
    const blocks = parseAnswer("Here is the deal:\n- you may prepay");
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list"]);
  });

  it("splits paragraphs on blank lines and keeps soft breaks inside one", () => {
    const blocks = parseAnswer("line one\nline two\n\nsecond para");
    expect(blocks).toHaveLength(2);
    expect(flatten((blocks[0] as { children: Inline[] }).children)).toBe(
      "line one\nline two",
    );
  });

  it("parses ATX headings", () => {
    const blocks = parseAnswer("### Prepayment\nYou may prepay.");
    expect(blocks[0]).toMatchObject({ type: "heading", level: 3 });
  });

  it("returns nothing for empty or whitespace-only input", () => {
    expect(parseAnswer("")).toEqual([]);
    expect(parseAnswer("   \n\n  ")).toEqual([]);
  });

  it("parses a real answer end to end", () => {
    const answer = [
      "Okay, friend, here's what the contract says:",
      "",
      "- **You can pay the loan off early** – that's called prepayment. [S1]",
      "- Before twelve EMIs you pay a **2 % penalty**. [S1]",
      "",
      "The contract doesn't spell out any other exit.",
    ].join("\n");

    const blocks = parseAnswer(answer);
    expect(blocks.map((b) => b.type)).toEqual(["paragraph", "list", "paragraph"]);

    const list = blocks[1] as Extract<(typeof blocks)[number], { type: "list" }>;
    expect(list.items).toHaveLength(2);
    // Asterisks gone, citation preserved as a token.
    expect(flatten(list.items[0])).toBe(
      "You can pay the loan off early – that's called prepayment. <cite:1>",
    );
    expect(flatten(list.items[0])).not.toContain("*");
  });
});
