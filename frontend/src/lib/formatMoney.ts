/**
 * Formats an amount given in the smallest currency unit (e.g. paise for INR)
 * into a human-readable string with two decimals and thousands separators.
 *
 * INR is prefixed with the ₹ symbol; every other currency has its uppercased
 * code appended instead. Dependency-free and SSR-safe.
 *
 * @example formatMoney(45000, "INR") // "₹450.00"
 * @example formatMoney(1000, "usd")  // "10.00 USD"
 */
export function formatMoney(amount: number, currency: string): string {
  const value = (Number.isFinite(amount) ? amount : 0) / 100;
  const formatted = value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const code = (currency || "").toUpperCase();
  if (code === "INR") return `₹${formatted}`;
  return `${formatted} ${code}`.trim();
}

/**
 * Formats an ISO timestamp into a short human date (year/month/day). Returns
 * an empty string for empty or invalid input so callers never render "Invalid
 * Date". Dependency-free and SSR-safe.
 *
 * @example formatDate("2026-07-21T10:00:00Z") // "Jul 21, 2026"
 */
export function formatDate(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
