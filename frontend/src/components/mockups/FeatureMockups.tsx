"use client";

import React from "react";

/**
 * Coded product-UI graphics that replace the static PNG screenshots on the
 * landing page. Each is a self-contained, non-interactive mini-mock rendered
 * from Linear-token styles so it stays crisp at any size and matches the app.
 *
 * They share a common browser-chrome frame (MockFrame) so the "How it works"
 * and feature rows read as real product captures.
 */

function MockFrame({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`shimmer w-full overflow-hidden rounded-xl ${className}`}
      style={{
        background: "var(--ln-surface-1)",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,0.05), 0 24px 50px -24px rgba(0,0,0,0.7), 0 0 0 1px var(--ln-hairline)",
      }}
    >
      <div
        className="flex items-center gap-2 px-3 py-2"
        style={{ borderBottom: "1px solid var(--ln-hairline)" }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#3e3e44" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#3e3e44" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "#3e3e44" }} />
        <span className="ml-2 truncate text-[10px] text-ink-subtle">{title}</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

const RISK = {
  High: { fg: "var(--ln-danger)", bg: "rgba(248,113,113,0.12)" },
  Medium: { fg: "var(--ln-warning)", bg: "rgba(251,191,36,0.12)" },
  Low: { fg: "var(--ln-success-bright)", bg: "rgba(39,166,68,0.14)" },
};

function RiskPill({ level }: { level: keyof typeof RISK }) {
  const s = RISK[level];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
      style={{ background: s.bg, color: s.fg }}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: s.fg }} />
      {level}
    </span>
  );
}

/* ── 1. Upload ── */
export function UploadMockup() {
  return (
    <MockFrame title="unbindai.app / upload">
      <div
        className="relative flex h-[150px] flex-col items-center justify-center gap-2 overflow-hidden rounded-lg border border-dashed"
        style={{ borderColor: "var(--ln-hairline-strong)", background: "var(--ln-canvas)" }}
      >
        {/* travelling scan line */}
        <div
          className="scan-line absolute inset-x-6 top-3 h-px"
          style={{ background: "linear-gradient(90deg, transparent, var(--ln-primary), transparent)" }}
        />
        <svg
          className="float-slow h-9 w-9 text-primary"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242" />
          <path d="M12 12v9" />
          <path d="m16 16-4-4-4 4" />
        </svg>
        <span className="text-[11px] font-medium text-ink-muted">Drop your contract</span>
        <span className="text-[9px] text-ink-subtle">PDF, TXT, or MD</span>
        <div
          className="mt-1 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px]"
          style={{ background: "rgba(39,166,68,0.14)", color: "var(--ln-success-bright)" }}
        >
          <span className="h-1 w-1 rounded-full" style={{ background: "var(--ln-success-bright)" }} />
          lease-agreement.pdf
        </div>
      </div>
    </MockFrame>
  );
}

/* ── 2. Clause analysis ── */
export function ClauseMockup() {
  return (
    <MockFrame title="unbindai.app / analysis">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ink">Clause analysis</span>
        <span className="rounded-full px-2 py-0.5 text-[9px]" style={{ background: "var(--ln-surface-2)", color: "var(--ln-ink-muted)" }}>
          12 clauses
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[
          { t: "Late Payment Penalty", r: "High" as const, active: true },
          { t: "Security Deposit", r: "Medium" as const, active: false },
          { t: "Governing Law", r: "Low" as const, active: false },
        ].map((c, i) => (
          <div
            key={i}
            className="rounded-md p-2"
            style={{
              background: c.active ? "var(--ln-surface-2)" : "var(--ln-surface-1)",
              border: `1px solid ${c.active ? "var(--ln-hairline-strong)" : "var(--ln-hairline)"}`,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="truncate text-[10px] font-medium text-ink">{c.t}</span>
              <RiskPill level={c.r} />
            </div>
            {c.active && (
              <p className="mt-1.5 text-[9px] leading-relaxed text-ink-subtle">
                $200/day late fee, compounding with no cap.
              </p>
            )}
          </div>
        ))}
      </div>
    </MockFrame>
  );
}

/* ── 3. Negotiation helper (original → suggested diff) ── */
export function NegotiationMockup() {
  return (
    <MockFrame title="unbindai.app / negotiate">
      <div className="mb-2 text-[10px] font-semibold text-ink">Suggested rewrite</div>
      <div className="flex flex-col gap-1.5">
        <div
          className="rounded-md p-2"
          style={{ background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)" }}
        >
          <span className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "var(--ln-danger)" }}>
            Original
          </span>
          <p className="mt-1 text-[9px] leading-relaxed text-ink-muted line-through decoration-danger/50">
            Fees of $200/day, compounding, with no cap.
          </p>
        </div>
        <div className="flex justify-center text-primary">
          <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14" /><path d="m19 12-7 7-7-7" />
          </svg>
        </div>
        <div
          className="rounded-md p-2"
          style={{ background: "rgba(39,166,68,0.1)", border: "1px solid rgba(39,166,68,0.28)" }}
        >
          <span className="text-[8px] font-semibold uppercase tracking-wide" style={{ color: "var(--ln-success-bright)" }}>
            AI suggested
          </span>
          <p className="mt-1 text-[9px] leading-relaxed text-ink-muted">
            One-time $50 fee, capped at one month&apos;s rent.
          </p>
        </div>
        <div className="mt-0.5 flex gap-1.5">
          {["Keep", "Use AI", "Custom"].map((b, i) => (
            <span
              key={b}
              className="flex-1 rounded px-1.5 py-1 text-center text-[9px]"
              style={
                i === 1
                  ? { background: "var(--ln-primary)", color: "#fff" }
                  : { background: "var(--ln-surface-2)", color: "var(--ln-ink-muted)", border: "1px solid var(--ln-hairline)" }
              }
            >
              {b}
            </span>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

/* ── 4. PDF export report ── */
export function ExportMockup() {
  return (
    <MockFrame title="unbindai.app / export">
      <div className="flex gap-3">
        {/* faux report page */}
        <div
          className="relative w-[92px] shrink-0 overflow-hidden rounded-md p-2"
          style={{ background: "#f5f6f6" }}
        >
          <div className="h-1.5 w-10 rounded-full" style={{ background: "#c7ccd1" }} />
          <div className="mt-2 flex flex-col gap-1">
            {[100, 82, 90, 70, 88, 60].map((w, i) => (
              <div key={i} className="h-1 rounded-full" style={{ width: `${w}%`, background: "#dfe3e7" }} />
            ))}
          </div>
          <div className="mt-2 h-4 w-full rounded" style={{ background: "rgba(94,106,210,0.18)" }} />
          <div className="mt-1.5 flex flex-col gap-1">
            {[76, 90, 64].map((w, i) => (
              <div key={i} className="h-1 rounded-full" style={{ width: `${w}%`, background: "#dfe3e7" }} />
            ))}
          </div>
        </div>
        {/* export controls */}
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-2">
          <div className="text-[10px] font-semibold text-ink">Analysis report</div>
          <div className="flex flex-col gap-1.5">
            {["Full risk breakdown", "Modified clauses", "Key dates & terms"].map((t) => (
              <div key={t} className="flex items-center gap-1.5 text-[9px] text-ink-muted">
                <svg className="h-2.5 w-2.5 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {t}
              </div>
            ))}
          </div>
          <div
            className="btn-sheen mt-0.5 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1.5 text-[9px] font-medium text-white"
            style={{ background: "var(--ln-primary)" }}
          >
            <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            Download PDF
          </div>
        </div>
      </div>
    </MockFrame>
  );
}

/* ── 5. Dashboard history ── */
export function DashboardMockup() {
  return (
    <MockFrame title="unbindai.app / dashboard">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-ink">Document history</span>
        <span
          className="rounded px-1.5 py-0.5 text-[9px] font-medium text-white"
          style={{ background: "var(--ln-primary)" }}
        >
          + New
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {[
          { n: "employment-offer.pdf", d: "2d ago", r: "Low" as const },
          { n: "saas-terms.pdf", d: "5d ago", r: "Medium" as const },
          { n: "lease-agreement.pdf", d: "1w ago", r: "High" as const },
        ].map((row, i) => (
          <div
            key={i}
            className="flex items-center gap-2 rounded-md p-2"
            style={{ background: "var(--ln-surface-1)", border: "1px solid var(--ln-hairline)" }}
          >
            <svg className="h-3.5 w-3.5 shrink-0 text-primary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" />
            </svg>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[10px] text-ink">{row.n}</div>
              <div className="text-[8px] text-ink-subtle">{row.d}</div>
            </div>
            <RiskPill level={row.r} />
          </div>
        ))}
      </div>
    </MockFrame>
  );
}
