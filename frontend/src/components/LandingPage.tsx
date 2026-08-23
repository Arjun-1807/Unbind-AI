"use client";

import React, { useRef, useState } from "react";
import Link from "next/link";
import { CheckIcon, ScaleIcon, SparklesIcon } from "./Icons";
import AmbientBackdrop from "./AmbientBackdrop";
import ScrollProgressBar from "./ScrollProgressBar";
import HeroProductMockup from "./HeroProductMockup";
import HowItWorksPipeline, { type PipelineStage } from "./HowItWorksPipeline";
import RedlineHeadline from "./RedlineHeadline";
import RedlineTicker from "./RedlineTicker";
import CapabilityGrid from "./CapabilityGrid";
import FaqAccordion, { type FaqItem } from "./FaqAccordion";
import LawyerRegistration from "./LawyerRegistration";
import TiltPanel from "./TiltPanel";
import ScrollWords from "./ScrollWords";
import ScrollScene from "./ScrollScene";
import {
  UploadMockup,
  ClauseMockup,
  NegotiationMockup,
  ExportMockup,
} from "./mockups/FeatureMockups";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { LANDING_VIEW_EVENT, type LandingView } from "@/lib/landingView";
import { useScrollScene } from "@/hooks/useScrollScene";

/* ── Local icons (only this page uses them) ───────────────────────────── */

const TerminalIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <polyline points="4 17 10 11 4 5" /><line x1="12" x2="20" y1="19" y2="19" />
  </svg>
);

const CopyIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="14" height="14" x="8" y="8" rx="2" ry="2" /><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
  </svg>
);

const ArrowRightIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
  </svg>
);

const LockIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="18" height="11" x="3" y="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const EyeIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" />
  </svg>
);

const CardIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <rect width="20" height="14" x="2" y="5" rx="2" /><path d="M2 10h20" />
  </svg>
);

/* ── Small shared pieces ──────────────────────────────────────────────── */

/** Section taxonomy label, led by a short lavender rule. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-3">
      <span
        aria-hidden="true"
        className="h-px w-6 shrink-0"
        style={{ background: "var(--ln-primary)" }}
      />
      <span className="t-label">{children}</span>
    </span>
  );
}

/** Hairline that dissolves at both ends, in place of a hard border rule. */
function Divider() {
  return (
    <div className="ln-shell">
      <hr className="ln-rule" />
    </div>
  );
}

/* ── Content ──────────────────────────────────────────────────────────── */

const STAGES: PipelineStage[] = [
  {
    label: "Ingest",
    title: "Upload or photograph the contract",
    desc: "Drag in a PDF or DOCX — or snap a photo of a paper contract and vision AI reads the text straight off the image.",
    meta: "PDF · DOCX · TXT · JPG · PNG",
    readout: "rental-agreement.pdf → text extracted",
    visual: <UploadMockup />,
  },
  {
    label: "Analyse",
    title: "Every clause read, scored and translated",
    desc: "Each clause gets a risk score, a plain-English summary, and a sweep for the dates and notice periods you cannot afford to miss.",
    meta: "clause-by-clause · risk scored · dates extracted",
    readout: "12 clauses · overall risk 7.2 / 10",
    visual: <ClauseMockup />,
  },
  {
    label: "Act",
    title: "Push back, then take it with you",
    desc: "A fairer rewrite for every risky term, a ready-to-send message in your own tone, and the whole analysis exported as a PDF.",
    meta: "redline · draft message · export",
    readout: "3 clauses redlined · message drafted",
    visual: <NegotiationMockup />,
  },
];

/**
 * The three things UnBind actually does, in the order a worried person needs
 * them. Everything else is a detail of one of these three and lives in the
 * capability grid below.
 */
const PILLARS = [
  {
    eyebrow: "Understand",
    title: "See every risk before you sign",
    body:
      "UnBind reads the contract clause by clause, scores how dangerous each one is, and rewrites the legalese into a sentence you can act on. The clauses that can hurt you sort to the top.",
    points: [
      "Clause-by-clause risk scoring with an overall risk meter",
      "Plain-English summary of what each clause really means",
      "Jargon translated, from indemnification to force majeure",
    ],
    mockup: <ClauseMockup />,
  },
  {
    eyebrow: "Negotiate",
    title: "Push back, in words you can send",
    body:
      "Knowing a clause is bad is only half of it. For every risky term UnBind drafts a fairer replacement, then turns the changes you pick into a polite message ready to paste into an email.",
    points: [
      "A suggested rewrite for every risky clause — keep it, take the AI's, or write your own",
      "Choose your points, tone and format; get a ready-to-send message",
      "Ask “what if I leave early?” and get an answer cited to the contract",
    ],
    mockup: <NegotiationMockup />,
  },
  {
    eyebrow: "Finish",
    title: "Leave with something you can use",
    body:
      "Export the full analysis as a formatted PDF, or export the contract itself with your negotiated changes applied — ready to send back. Deadlines go straight to your calendar.",
    points: [
      "Full analysis as a formatted PDF report",
      "Modified contract export with your clause changes applied",
      "Key dates exported to calendar, with email reminders before they land",
    ],
    mockup: <ExportMockup />,
  },
];

const PLANS = [
  {
    name: "Free",
    price: "₹0",
    period: "forever",
    blurb: "Enough to check the contract in front of you.",
    features: ["1 full analysis per day", "10 follow-up questions per day", "No card required"],
    cta: "Start free",
    href: "/signup",
    featured: false,
  },
  {
    name: "Brief",
    price: "₹100",
    period: "1 month",
    blurb: "For a month with a few contracts in it.",
    features: ["Top-end AI models", "Faster analysis", "3 analyses per day", "40 AI questions per day"],
    cta: "Get Brief",
    href: "/pricing",
    featured: false,
  },
  {
    name: "Motion",
    price: "₹450",
    period: "1 month",
    blurb: "Deeper analysis, for higher-stakes paperwork.",
    features: ["Everything in Brief", "Deeper analysis", "5 analyses per day", "100 AI questions per day"],
    cta: "Get Motion",
    href: "/pricing",
    featured: true,
  },
  {
    name: "Verdict",
    price: "₹2500",
    period: "lifetime",
    blurb: "Pay once. Never think about limits again.",
    features: [
      "Unlimited analyses and questions",
      "Curated lawyer referrals",
      "CLI tool access (exclusive)",
      "Lifetime access",
    ],
    cta: "Get Verdict",
    href: "/pricing",
    featured: false,
  },
];

const FAQS: FaqItem[] = [
  {
    q: "Is this legal advice?",
    a: (
      <>
        No. UnBind is not a law firm and is not a substitute for legal counsel. It is
        built to make a contract legible — so you understand what you are agreeing to,
        spot the terms worth arguing about, and walk into a conversation with a lawyer
        knowing which clause to point at. For anything high-stakes, get a lawyer.
        Verdict plan users can find one through the referral directory.
      </>
    ),
  },
  {
    q: "What happens to my contract after I upload it?",
    a: (
      <>
        To produce the analysis, the text of your document is sent to Groq, a
        third-party AI inference provider — there is currently no way to run the
        analysis without it. Photos and scans are additionally sent to a vision model
        for text recognition. Your documents and their analyses are stored so you can
        revisit them from your dashboard. The{" "}
        <Link href="/privacy#ai-processing" className="text-primary underline underline-offset-2 hover:text-primary-hover">
          Privacy Policy
        </Link>{" "}
        spells out every one of these flows in detail — it is worth two minutes before
        you upload anything sensitive.
      </>
    ),
  },
  {
    q: "What can I upload?",
    a: (
      <>
        PDF, DOCX, TXT and Markdown files, plus photographs and scans (JPG, PNG, WEBP,
        TIFF, BMP) — a phone snap of a paper contract works, because vision AI reads
        the text off the image first.
      </>
    ),
  },
  {
    q: "What kinds of contracts does it handle?",
    a: (
      <>
        Everyday commercial and personal agreements: NDAs, rental and lease
        agreements, employment contracts, SaaS and vendor terms, freelance and
        consulting agreements. It is strongest where contracts follow familiar
        patterns and weakest on bespoke, heavily negotiated instruments.
      </>
    ),
  },
  {
    q: "Is the free tier really free?",
    a: (
      <>
        Yes — one full analysis and ten follow-up questions every day, no card. Paid
        plans exist for people who need more throughput, deeper analysis, or the
        lawyer directory.
      </>
    ),
  },
  {
    q: "Do paid plans auto-renew?",
    a: (
      <>
        No. Brief and Motion are fixed one-month terms that simply expire — nothing
        recurring is charged. Verdict is a single one-time payment for lifetime access.
        Payments are handled by Razorpay.
      </>
    ),
  },
];

const TRUST = [
  {
    icon: <LockIcon className="h-5 w-5" />,
    title: "Encrypted in transit",
    desc: "Everything moves over encrypted connections. Passwords are hashed, never stored in plain text, and sessions use signed HTTP-only tokens.",
  },
  {
    icon: <CardIcon className="h-5 w-5" />,
    title: "Card details never reach us",
    desc: "Payments are handled directly by Razorpay. Your card number does not touch UnBind's systems at any point.",
  },
  {
    icon: <EyeIcon className="h-5 w-5" />,
    title: "We name every third party",
    desc: "Analysis runs on Groq's inference API, so your document text goes there. We would rather tell you plainly than bury it.",
  },
];

/* ── Page ─────────────────────────────────────────────────────────────── */

const LandingPage: React.FC = () => {
  const [view, setView] = useState<LandingView>("clients");

  // Tell the header which view is showing. Its section-nav anchors only exist
  // in the client view, so without this they stay on screen pointing at
  // sections that are no longer in the DOM.
  React.useEffect(() => {
    const announce = (v: LandingView): void => {
      window.dispatchEvent(new CustomEvent<LandingView>(LANDING_VIEW_EVENT, { detail: v }));
    };
    announce(view);
    // Leaving the route counts as leaving the lawyer view.
    return () => announce("clients");
  }, [view]);
  const [copied, setCopied] = useState(false);

  // Drive scroll-triggered entrance animations. Re-scan when the view
  // switches so newly-mounted `.reveal` nodes get observed.
  const rootRef = useRef<HTMLDivElement>(null);
  useScrollReveal(rootRef, [view]);

  // The hero artwork recedes as the page moves past it.
  const heroDepartRef = useScrollScene<HTMLDivElement>();

  const showLawyers = () => {
    setView("lawyers");
    window.scrollTo({ top: 0, behavior: "auto" });
  };
  const showClients = () => {
    setView("clients");
    window.scrollTo({ top: 0, behavior: "auto" });
  };

  const handleCopy = () => {
    navigator.clipboard.writeText("npm install -g unbindai");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (view === "lawyers") {
    return (
      <>
        <AmbientBackdrop />
        <div ref={rootRef} className="w-full fade-in">
          <LawyerRegistration onBack={showClients} />
        </div>
      </>
    );
  }

  return (
    <>
      {/* Both are position: fixed, so they must sit OUTSIDE the .fade-in
          wrapper — a transformed ancestor retargets fixed descendants to
          itself, which would make the backdrop scroll away with the page and
          strand the progress bar at the top of the document. */}
      <AmbientBackdrop />
      <ScrollProgressBar />

      <div ref={rootRef} className="w-full fade-in">

      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="relative pb-16 pt-14 sm:pb-24 sm:pt-20 lg:pt-24">
        <div className="ln-shell text-center">
          <div
            className="rise-in mb-7 inline-flex items-center gap-2.5 rounded-full border border-hairline bg-surface-1/80 px-3.5 py-1.5 text-[13px] font-medium text-ink-muted"
            style={{ letterSpacing: "0.4px", ["--i" as string]: 0 }}
          >
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span
                className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-70"
                style={{ background: "var(--ln-primary-hover)" }}
              />
              <span
                className="relative inline-flex h-1.5 w-1.5 rounded-full"
                style={{ background: "var(--ln-primary-hover)" }}
              />
            </span>
            AI-powered contract intelligence
          </div>

          <RedlineHeadline
            className="t-display rise-in mx-auto text-ink"
            style={{ ["--i" as string]: 1 }}
          />

          <p
            className="t-lead rise-in mx-auto mt-6 max-w-2xl text-ink-subtle"
            style={{ ["--i" as string]: 2 }}
          >
            Upload a contract and know exactly what you are signing. Every risky clause
            found, scored, explained in plain English — and rewritten into words you
            can send back.
          </p>

          <div
            className="rise-in mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ ["--i" as string]: 3 }}
          >
            <Link
              href="/signup"
              className="btn-sheen ln-btn-primary group inline-flex w-full items-center justify-center px-5 py-3 text-sm sm:w-auto"
            >
              Analyse a contract free
              <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <a
              href="#how-it-works"
              className="ln-btn-secondary inline-flex w-full items-center justify-center px-5 py-3 text-sm sm:w-auto"
            >
              See how it works
            </a>
          </div>

          <p
            className="rise-in mt-5 text-[13px] text-ink-tertiary"
            style={{ ["--i" as string]: 4 }}
          >
            No credit card · One free analysis every day · First result in about two
            minutes
          </p>
        </div>

        {/* Product UI as protagonist — live components, not a screenshot, so a
            visitor can click through the clauses. The tilt is pointer-only and
            deliberately shallow; it should register as depth, not as a toy. */}
        {/* Full-bleed but inset a few pixels from the viewport edge, the way
            the reference site frames its hero media — the artwork reads as a
            pane set into the page rather than another item in the text column. */}
        <div className="relative mt-14 px-3 sm:mt-16 sm:px-5">
          <div className="rise-in" style={{ ["--i" as string]: 5 }}>
            <div ref={heroDepartRef} className="hero-depart">
            <TiltPanel>
              <div className="lit-edge overflow-hidden rounded-2xl sm:rounded-[20px]">
                <HeroProductMockup />
              </div>
            </TiltPanel>
            </div>
          </div>
        </div>
      </section>

      {/* ── Proof: real redlines the product produces ─────────────────── */}
      <RedlineTicker />

      <Divider />

      {/* ── Statement ────────────────────────────────────────────────────
          A full-viewport beat that argues the premise before the product
          shows up. The copy lights word by word as it rises, which is the
          reference site's defining motion and the reason to give a single
          sentence an entire screen. */}
      <section className="relative flex min-h-[84vh] items-center">
        <div className="ln-shell ln-measure-lg">
          <Eyebrow>The problem</Eyebrow>
          <ScrollWords
            as="h2"
            className="t-statement mt-6 text-ink"
            text="Nobody reads the fine print. It was never written to be read."
          />
          <ScrollWords
            as="p"
            className="t-lead mt-8 max-w-xl text-ink-subtle"
            feather={10}
            text="It was written to be agreed to. UnBind reads it instead — in about two minutes — and tells you which sentences are going to cost you."
          />
        </div>
      </section>

      <Divider />

      {/* ── How it works ─────────────────────────────────────────────── */}
      <section id="how-it-works" className="scroll-mt-16">
        <div className="ln-shell">
          <HowItWorksPipeline stages={STAGES} />
        </div>
      </section>

      <Divider />

      {/* ── The three pillars ────────────────────────────────────────── */}
      <section id="features" className="ln-section scroll-mt-16">
        <div className="ln-shell">
          <div className="scene--hold mx-auto mb-16 max-w-2xl text-center sm:mb-24">
            <Eyebrow>What you get</Eyebrow>
            <h2 className="t-section mt-4 text-ink">
              Everything you need to understand any contract
            </h2>
            <p className="mt-4 text-base text-ink-subtle sm:text-lg">
              Three things happen to a contract you put through UnBind. None of them
              require you to know what an indemnity is.
            </p>
          </div>

          <div className="flex flex-col gap-20 sm:gap-28">
            {PILLARS.map((pillar, i) => (
              <ScrollScene
                key={pillar.title}
                className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16"
              >
                {/* Alternate which side the artwork lands on, so the eye
                    zigzags down the page instead of running a straight rail. */}
                <div className={`relative ${i % 2 === 1 ? "lg:order-2" : ""}`}>
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute -left-2 -top-14 select-none text-8xl font-semibold text-ink opacity-[0.04]"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Eyebrow>{pillar.eyebrow}</Eyebrow>
                  <h3 className="t-sub mt-4 text-ink">
                    {pillar.title}
                  </h3>
                  <p className="mt-4 text-base leading-relaxed text-ink-subtle">
                    {pillar.body}
                  </p>
                  <ul className="mt-6 space-y-3">
                    {pillar.points.map((point) => (
                      <li key={point} className="flex items-start gap-3">
                        <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                        <span className="text-sm text-ink-muted">{point}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={i % 2 === 1 ? "lg:order-1" : undefined}>
                  <ScrollScene mode="unfold" className="mx-auto max-w-md lg:max-w-none">
                    <div className="lift lit-edge rounded-xl">{pillar.mockup}</div>
                  </ScrollScene>
                </div>
              </ScrollScene>
            ))}
          </div>
        </div>
      </section>

      {/* ── The long tail ────────────────────────────────────────────── */}
      <section className="ln-band ln-section">
        <div className="ln-shell">
          <div className="scene--hold mx-auto mb-12 max-w-2xl text-center">
            <Eyebrow>And the rest</Eyebrow>
            <h2 className="t-section mt-4 text-ink">
              The details that turn an analysis into a decision
            </h2>
          </div>
          <CapabilityGrid />
        </div>
      </section>

      {/* ── Trust ────────────────────────────────────────────────────── */}
      <section className="ln-section">
        <div className="ln-shell ln-measure-lg">
          <div className="scene--hold mx-auto mb-12 max-w-2xl text-center">
            <Eyebrow>Before you upload</Eyebrow>
            <h2 className="t-section mt-4 text-ink">
              You are handing us a private document. Here is what happens to it.
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {TRUST.map((item, i) => (
              <div
                key={item.title}
                className="reveal lift lit-edge ln-card p-6"
                style={{ ["--i" as string]: i }}
              >
                <div
                  className="mb-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-primary"
                  style={{
                    background: "color-mix(in srgb, var(--ln-primary) 12%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--ln-primary) 25%, transparent)",
                  }}
                >
                  {item.icon}
                </div>
                <h3 className="mb-1.5 text-[15px] font-medium text-ink">{item.title}</h3>
                <p className="text-sm leading-relaxed text-ink-subtle">{item.desc}</p>
              </div>
            ))}
          </div>

          <p className="reveal mt-8 text-center text-sm text-ink-tertiary">
            The{" "}
            <Link href="/privacy" className="text-ink-subtle underline underline-offset-2 hover:text-ink">
              Privacy Policy
            </Link>{" "}
            lists every provider in the pipeline and exactly what each one receives.
            UnBind is not a substitute for legal counsel.
          </p>
        </div>
      </section>

      {/* ── Pricing ──────────────────────────────────────────────────── */}
      <section id="pricing" className="ln-band ln-section scroll-mt-16">
        <div className="ln-shell">
          <div className="scene--hold mx-auto mb-12 max-w-2xl text-center sm:mb-16">
            <Eyebrow>Pricing</Eyebrow>
            <h2 className="t-section mt-4 text-ink">
              Simple, transparent pricing
            </h2>
            <p className="mt-4 text-base text-ink-subtle sm:text-lg">
              Start free and upgrade when you need more. Nothing auto-renews.
            </p>

            {/* The single most persuasive fact on the page, given room to land. */}
            <div className="mt-8 inline-flex flex-col items-center gap-1 rounded-xl border border-hairline bg-canvas/70 px-6 py-4 sm:flex-row sm:gap-4">
              <span className="text-sm text-ink-subtle line-through">
                ₹15,000+ for a lawyer to review one contract
              </span>
              <ArrowRightIcon className="hidden h-4 w-4 text-ink-tertiary sm:block" />
              <span className="text-sm font-medium" style={{ color: "var(--ln-success-bright)" }}>
                from ₹100/month here
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {PLANS.map((plan, i) => (
              <div
                key={plan.name}
                className={`reveal lift relative flex flex-col p-6 ${
                  plan.featured ? "ln-card-raised conic-ring" : "ln-card lit-edge"
                }`}
                style={{ ["--i" as string]: i }}
              >
                {plan.featured && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="btn-sheen inline-block rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-white">
                      POPULAR
                    </span>
                  </div>
                )}
                <h3 className="mb-1 text-lg font-semibold text-ink">{plan.name}</h3>
                <div className="mb-3 flex items-baseline gap-1">
                  <span className="text-3xl font-semibold text-ink">{plan.price}</span>
                  <span className="text-sm text-ink-subtle">/{plan.period}</span>
                </div>
                <p className="mb-5 text-sm text-ink-subtle">{plan.blurb}</p>
                <ul className="mb-8 grow space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-sm text-ink-muted">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link
                  href={plan.href}
                  className={`inline-flex w-full justify-center py-2.5 text-sm ${
                    plan.featured ? "ln-btn-primary" : "ln-btn-secondary"
                  }`}
                >
                  {plan.cta}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLI — a Verdict perk, sized like one ─────────────────────── */}
      <section id="cli" className="ln-section scroll-mt-16">
        <div className="ln-shell">
          <ScrollScene className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-1/80 px-3 py-1 text-sm font-medium text-ink-muted">
                <TerminalIcon className="h-3.5 w-3.5 shrink-0 text-primary" />
                CLI tool · exclusive to Verdict
              </div>
              <h2 className="t-section text-ink">
                Analyse contracts from your terminal
              </h2>
              <p className="mt-4 text-base leading-relaxed text-ink-subtle">
                No browser needed. Install the CLI and get a full interactive REPL —
                the same analysis as the web app, piped into your workflow.
              </p>
              <div className="mt-6 space-y-3">
                {[
                  "Upload and analyse PDFs from the command line",
                  "Interactive REPL with rich formatted output",
                  "Secure auth with persistent session tokens",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <span className="text-sm text-ink-muted">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lit-edge overflow-hidden rounded-xl border border-hairline bg-surface-1">
              <div className="flex items-center gap-2 border-b border-hairline bg-canvas/60 px-4 py-3">
                <div className="h-3 w-3 rounded-full bg-hairline-tertiary" />
                <div className="h-3 w-3 rounded-full bg-hairline-tertiary" />
                <div className="h-3 w-3 rounded-full bg-hairline-tertiary" />
                <span className="ml-3 font-mono text-xs text-ink-subtle">terminal</span>
              </div>
              <div className="overflow-x-auto p-5 font-mono text-xs leading-relaxed sm:text-sm">
                <div className="text-ink-muted">
                  <span className="text-primary">$</span> npm install -g unbindai
                </div>
                <div className="mt-1 text-ink-subtle">added 42 packages in 3s</div>
                <div className="mt-3 text-ink-muted">
                  <span className="text-primary">$</span> unbind contract.pdf
                </div>
                <div className="mt-2 whitespace-nowrap text-ink-subtle">
                  <div className="text-primary">╭──────────────────────────────────────╮</div>
                  <div className="text-primary">│ <span className="font-semibold text-ink">UnBindAI CLI</span>                        │</div>
                  <div className="text-primary">│ <span className="text-ink-subtle">AI-powered contract analysis</span>        │</div>
                  <div className="text-primary">╰──────────────────────────────────────╯</div>
                </div>
                <div className="mt-2">
                  <span className="text-warning">⚠</span>
                  <span className="text-ink-muted"> Analyzing contract.pdf...</span>
                </div>
                <div className="mt-1">
                  <span className="text-success">✓</span>
                  <span className="text-ink-muted"> Found 12 clauses · Risk Score: </span>
                  <span className="font-semibold text-danger">7.2/10</span>
                </div>
                <div className="mt-3 text-ink-muted">
                  <span className="text-primary">unbind&gt;</span> redline &quot;Late Payment Penalty&quot;
                </div>
                <div className="mt-1 text-danger">- $200/day, compounding, no cap</div>
                <div style={{ color: "var(--ln-success-bright)" }}>
                  + $50 one-time fee, capped at 1 month&apos;s rent
                </div>
                <div className="caret mt-2 text-ink-muted">
                  <span className="text-primary">unbind&gt;</span>
                </div>
              </div>
            </div>
          </ScrollScene>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────────────────── */}
      <section id="faq" className="ln-band ln-section scroll-mt-16">
        <div className="ln-shell ln-measure-sm">
          <div className="scene--hold mb-10 text-center">
            <Eyebrow>Questions</Eyebrow>
            <h2 className="t-section mt-4 text-ink">
              The things worth asking first
            </h2>
          </div>
          <ScrollScene>
            <FaqAccordion items={FAQS} />
          </ScrollScene>
        </div>
      </section>

      {/* ── Closing CTA ──────────────────────────────────────────────── */}
      <section className="ln-section relative overflow-hidden">
        <div
          aria-hidden="true"
          className="glow-pulse pointer-events-none absolute left-1/2 top-1/2 h-64 w-[38rem] max-w-[90vw] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
          style={{ background: "radial-gradient(closest-side, rgba(94,106,210,0.20), transparent)" }}
        />
        <ScaleIcon
          aria-hidden="true"
          className="pointer-events-none absolute left-1/2 top-1/2 h-[26rem] w-[26rem] -translate-x-1/2 -translate-y-1/2 text-ink opacity-[0.04]"
          strokeWidth={1}
        />
        <div className="ln-shell ln-measure-sm scene--hold relative text-center">
          <h2 className="t-section text-ink">
            Let justice be done though the heavens fall
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-ink-subtle sm:text-lg">
            Get started free — no credit card required. Analyse your first contract in
            under two minutes.
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/signup"
              className="btn-sheen ln-btn-primary group inline-flex w-full items-center justify-center px-6 py-3 text-sm sm:w-auto"
            >
              Get started free
              <ArrowRightIcon className="ml-2 h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
            </Link>
            <Link
              href="/login"
              className="ln-btn-secondary inline-flex w-full items-center justify-center px-6 py-3 text-sm sm:w-auto"
            >
              Sign in
            </Link>
          </div>

          <div className="mt-8">
            <p className="mb-2 text-sm text-ink-subtle">Or install the CLI</p>
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex max-w-full cursor-pointer items-center gap-2 rounded-md border border-hairline bg-surface-1/80 px-4 py-2 transition-colors duration-200 hover:border-hairline-strong"
            >
              <span className="font-mono text-sm text-primary">$</span>
              <code className="truncate font-mono text-sm text-ink-muted">
                npm install -g unbindai
              </code>
              <span className="text-ink-subtle">
                {copied ? (
                  <CheckIcon className="h-3.5 w-3.5 text-success" />
                ) : (
                  <CopyIcon className="h-3.5 w-3.5" />
                )}
              </span>
              <span className="sr-only">
                {copied ? "Command copied" : "Copy install command"}
              </span>
            </button>
          </div>
        </div>
      </section>

      <Divider />

      {/* ── Secondary audience ───────────────────────────────────────── */}
      <section className="py-10">
        <div className="ln-shell">
          <div className="flex flex-col items-center justify-between gap-4 text-center sm:flex-row sm:text-left">
            <div>
              <h2 className="text-base font-medium text-ink">
                Are you a legal professional?
              </h2>
              <p className="mt-1 text-sm text-ink-subtle">
                Join the referral network and get matched with clients who already know
                which clause they need help with.
              </p>
            </div>
            <button
              onClick={showLawyers}
              className="ln-btn-secondary inline-flex shrink-0 cursor-pointer items-center gap-2 px-4 py-2 text-sm"
            >
              <ScaleIcon className="h-4 w-4 text-primary" strokeWidth={1.8} />
              Join as a lawyer
            </button>
          </div>
        </div>
        </section>
      </div>
    </>
  );
};

export default LandingPage;
