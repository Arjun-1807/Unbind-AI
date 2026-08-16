import { describe, it, expect } from "vitest";
import { escapeIcsText } from "./ics";

describe("escapeIcsText", () => {
  it("leaves plain text untouched", () => {
    expect(escapeIcsText("Renewal notice deadline")).toBe(
      "Renewal notice deadline",
    );
  });

  it("escapes backslashes before the escapes it adds", () => {
    expect(escapeIcsText("path\\to")).toBe("path\\\\to");
    expect(escapeIcsText("a\\,b")).toBe("a\\\\\\,b");
  });

  it("escapes semicolons and commas", () => {
    expect(escapeIcsText("Notice; then, terminate")).toBe(
      "Notice\\; then\\, terminate",
    );
  });

  it("converts CRLF, CR and LF to the literal \\n sequence", () => {
    expect(escapeIcsText("a\r\nb")).toBe("a\\nb");
    expect(escapeIcsText("a\rb")).toBe("a\\nb");
    expect(escapeIcsText("a\nb")).toBe("a\\nb");
  });

  it("neutralises an injected VEVENT in model output", () => {
    const malicious =
      "Renewal\r\nEND:VEVENT\r\nBEGIN:VEVENT\r\nSUMMARY:Wire $50k now";
    const escaped = escapeIcsText(malicious);
    expect(escaped).not.toContain("\r");
    expect(escaped).not.toContain("\n");
    expect(escaped).toBe(
      "Renewal\\nEND:VEVENT\\nBEGIN:VEVENT\\nSUMMARY:Wire $50k now",
    );
  });

  it("handles nullish input without throwing", () => {
    expect(escapeIcsText(undefined as unknown as string)).toBe("");
    expect(escapeIcsText(null as unknown as string)).toBe("");
  });
});
