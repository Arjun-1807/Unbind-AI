import { describe, expect, it } from "vitest";

import { formatMoney, formatDate } from "@/lib/formatMoney";

describe("formatMoney", () => {
  it("prefixes ₹ for INR and divides paise by 100", () => {
    expect(formatMoney(45000, "INR")).toBe("₹450.00");
  });

  it("is case-insensitive about the INR code", () => {
    expect(formatMoney(45000, "inr")).toBe("₹450.00");
  });

  it("appends the uppercased currency code for non-INR", () => {
    expect(formatMoney(1000, "usd")).toBe("10.00 USD");
  });

  it("always shows two decimal places", () => {
    expect(formatMoney(100, "INR")).toBe("₹1.00");
    expect(formatMoney(150, "INR")).toBe("₹1.50");
  });

  it("adds thousands separators", () => {
    expect(formatMoney(123456789, "INR")).toBe("₹1,234,567.89");
    expect(formatMoney(100000000, "usd")).toBe("1,000,000.00 USD");
  });

  it("formats zero", () => {
    expect(formatMoney(0, "INR")).toBe("₹0.00");
    expect(formatMoney(0, "usd")).toBe("0.00 USD");
  });
});

describe("formatDate", () => {
  it("returns a non-empty string for a valid ISO date", () => {
    expect(formatDate("2026-07-21T10:00:00Z").length).toBeGreaterThan(0);
  });

  it("returns '' for an empty string", () => {
    expect(formatDate("")).toBe("");
  });

  it("returns '' for an invalid date string", () => {
    expect(formatDate("not-a-date")).toBe("");
  });
});
