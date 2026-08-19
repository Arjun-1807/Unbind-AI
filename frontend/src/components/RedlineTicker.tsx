"use client";


const REDLINES: { label: string; before: string; after: string }[] = [
  { label: "Late Payment Penalty", before: "$200/day, compounding, no cap", after: "$50 one-time fee, capped at 1 month's rent" },
  { label: "Security Deposit", before: "Retained at landlord's sole discretion", after: "Refundable within 14 days, itemized" },
  { label: "Early Termination", before: "May not terminate under any circumstances", after: "Terminate early with 60 days' notice" },
  { label: "Auto-Renewal", before: "Renews for 3 years unless cancelled 90 days prior", after: "Renews for 1 year, cancel anytime with 30 days' notice" },
  { label: "Liability Cap", before: "Uncapped liability for any and all damages", after: "Capped at fees paid in the last 12 months" },
  { label: "Non-Compete", before: "Restricted from similar work for 5 years, worldwide", after: "Restricted for 6 months, current region only" },
  { label: "Confidentiality", before: "Survives indefinitely after termination", after: "Survives for 2 years after termination" },
  { label: "Governing Law", before: "Resolved exclusively in the company's home court", after: "Resolved via neutral arbitration" },
];

function RedlineChip({ item }: { item: (typeof REDLINES)[number] }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap rounded-lg border border-hairline bg-surface-1 px-4 py-2">
      <span className="text-[10px] font-semibold uppercase tracking-wide text-ink-tertiary">
        {item.label}
      </span>
      <span className="text-xs line-through" style={{ color: "var(--ln-danger)" }}>
        {item.before}
      </span>
      <svg className="h-3 w-3 shrink-0 text-ink-tertiary" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
      </svg>
      <span className="text-xs" style={{ color: "#4ade80" }}>
        {item.after}
      </span>
    </div>
  );
}

export default function RedlineTicker() {
  return (
    <section className="py-10 border-t border-hairline">
      <p className="mx-auto mb-6 max-w-7xl px-4 text-center text-xs font-medium uppercase tracking-wide text-ink-tertiary sm:px-6 lg:px-8">
        Real redlines, applied automatically
      </p>
      <div
        className="overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]"
        aria-hidden="true"
      >
        <div className="marquee-track flex w-max gap-4 hover:[animation-play-state:paused]">
          {[...REDLINES, ...REDLINES].map((item, i) => (
            <RedlineChip key={i} item={item} />
          ))}
        </div>
      </div>
    </section>
  );
}
