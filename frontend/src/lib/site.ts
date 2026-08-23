/**
 * Canonical site identity, in one place.
 *
 * Every absolute URL the app emits — canonicals, OG tags, the sitemap, robots
 * — derives from `SITE_URL`, so pointing a custom domain at this deployment is
 * a single environment variable rather than a search-and-replace across the
 * metadata surface.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL || "https://unbindai.vercel.app"
).replace(/\/+$/, "");

export const SITE_NAME = "UnBind AI";

export const SITE_TAGLINE = "AI Legal Contract Analyzer";

export const SITE_DESCRIPTION =
  "Upload a contract and get a plain-English, clause-by-clause risk breakdown in minutes. UnBind AI flags risky terms, explains the jargon, suggests fairer wording, and tracks your deadlines — built for people without legal training.";

/**
 * Public contact addresses for the legal pages.
 *
 * These render to real users on /privacy and /terms, and the policies grant
 * rights (data access, deletion, grievance redressal) that are only meaningful
 * if the address actually reaches you. They previously pointed at
 * `@unbind.ai`, a domain this project does not own, which made every one of
 * those promises unreachable.
 *
 * Kept here rather than inline so there is one place to change when a custom
 * domain lands.
 */
export const PRIVACY_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_PRIVACY_EMAIL || "unbind.legal@gmail.com";

export const LEGAL_CONTACT_EMAIL =
  process.env.NEXT_PUBLIC_LEGAL_EMAIL || "unbind.legal@gmail.com";

/**
 * Governing law and exclusive jurisdiction for the Terms.
 *
 * Rendered verbatim into /terms §15. This was shipping as a literal
 * "[Governing Law Jurisdiction — to be finalized by Legal]" bracket, which
 * leaves the clause unenforceable.
 */
export const GOVERNING_LAW_JURISDICTION = "India";
export const JURISDICTION_COURTS = "Bengaluru, Karnataka, India";
