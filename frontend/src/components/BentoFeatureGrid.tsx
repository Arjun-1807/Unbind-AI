"use client";

import React from "react";
import { motion } from "framer-motion";
import {
  AlertTriangleIcon,
  CameraIcon,
  ShieldCheckIcon,
  SparklesIcon,
  CalendarIcon,
  FileSearchIcon,
  FileTextIcon,
  DownloadIcon,
  LogoIcon,
} from "./Icons";
import {
  ClauseMockup,
  NegotiationMockup,
  ExportMockup,
  DashboardMockup,
} from "./mockups/FeatureMockups";
import { useMediaQuery } from "@/hooks/useMediaQuery";

const TargetIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
  </svg>
);

const BookOpenIcon = (props: React.SVGProps<SVGSVGElement>) => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
  </svg>
);

type Feature = {
  icon: React.ReactNode;
  title: string;
  desc: string;
  size: "lg" | "sm";
  mockup?: React.ReactNode;
};

const FEATURES: Feature[] = [
  {
    icon: <AlertTriangleIcon className="h-6 w-6" />,
    title: "Risk Analysis",
    desc: "Clause-by-clause risk scoring with a visual risk meter. See what's dangerous before you sign.",
    size: "lg",
    mockup: <ClauseMockup />,
  },
  {
    icon: <CameraIcon className="h-6 w-6" />,
    title: "Snap a Photo",
    desc: "Only have a paper contract? Photograph or scan it and our vision AI reads the text for you — no typing.",
    size: "sm",
  },
  {
    icon: <SparklesIcon className="h-6 w-6" />,
    title: "Negotiation Message",
    desc: "Turn the changes you want into a polite, ready-to-send message — pick the points, tone, and format, then copy and send.",
    size: "sm",
  },
  {
    icon: <BookOpenIcon className="h-6 w-6" />,
    title: "Key Terms Glossary",
    desc: "Legal jargon translated to plain English. Understand indemnification, force majeure, and more.",
    size: "sm",
  },
  {
    icon: <ShieldCheckIcon className="h-6 w-6" />,
    title: "Negotiation Helper",
    desc: "AI-suggested clause rewrites with keep, AI, or custom options for every risky term.",
    size: "lg",
    mockup: <NegotiationMockup />,
  },
  {
    icon: <CalendarIcon className="h-6 w-6" />,
    title: "Key Dates & Deadlines",
    desc: "Automatic deadline extraction with ICS calendar export. Never miss a renewal or notice period.",
    size: "sm",
  },
  {
    icon: <TargetIcon className="h-6 w-6" />,
    title: "Ask Anything",
    desc: 'Ask what a clause means, or "what if I leave early?" — answers come from your contract, in a conversation that remembers what you asked.',
    size: "sm",
  },
  {
    icon: <DownloadIcon className="h-6 w-6" />,
    title: "PDF Export & Modified Contracts",
    desc: "Download your full analysis as a formatted PDF report. Export modified contracts with your negotiated clause changes applied — ready to send to the other party.",
    size: "lg",
    mockup: <ExportMockup />,
  },
  {
    icon: <FileSearchIcon className="h-6 w-6" />,
    title: "Source Citations",
    desc: "Every answer links to the exact clause it's based on — one click jumps you straight there in the document.",
    size: "sm",
  },
  {
    icon: <FileTextIcon className="h-6 w-6" />,
    title: "Document View",
    desc: "Side-by-side contract view with interactive clause highlighting linked to the analysis.",
    size: "sm",
  },
  {
    icon: <LogoIcon className="h-6 w-6" />,
    title: "Dashboard & History",
    desc: "All your past analyses in one place. Re-visit any contract, compare risk scores over time, and manage your account with secure JWT-based authentication.",
    size: "lg",
    mockup: <DashboardMockup />,
  },
];

function FeatureCard({ feature, index }: { feature: Feature; index: number }) {
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  const isLarge = feature.size === "lg";

  return (
    <div
      className={`reveal lift group ln-card p-6 flex flex-col hover:border-hairline-strong ${
        isLarge ? "sm:col-span-2 lg:col-span-2 lg:row-span-2" : ""
      }`}
      style={{ ["--i" as string]: index % 3 }}
    >
      <div
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg text-primary transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-3"
        style={{ background: "rgba(94,106,210,0.12)", border: "1px solid rgba(94,106,210,0.25)" }}
      >
        {feature.icon}
      </div>
      <h3 className="text-lg font-medium text-ink mb-2">{feature.title}</h3>
      <p className="text-ink-subtle text-sm leading-relaxed">{feature.desc}</p>
      {isLarge && feature.mockup && (
        <motion.div
          className="mt-5 max-w-[360px]"
          whileHover={reducedMotion ? undefined : { scale: 1.03, y: -4 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {feature.mockup}
        </motion.div>
      )}
    </div>
  );
}

export default function BentoFeatureGrid() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:[grid-auto-flow:dense] lg:auto-rows-[210px]">
      {FEATURES.map((feature, i) => (
        <FeatureCard key={feature.title} feature={feature} index={i} />
      ))}
    </div>
  );
}
