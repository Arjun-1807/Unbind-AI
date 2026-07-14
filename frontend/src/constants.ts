import { RiskLevel } from "./types";

export const APP_NAME = "UnBind";

export const TABS = {
  RISK_ANALYSIS: "Risk Analysis",
  NEGOTIATION_HELPER: "Negotiation Helper",
  KEY_TERMS_GLOSSARY: "Key Terms Glossary",
  KEY_DATES: "Key Dates",
  IMPACT_SIMULATOR: "Impact Simulator",
};

export const RISK_COLORS: {
  [key in RiskLevel]: {
    text: string;
    bg: string;
    border: string;
    gradientFrom: string;
    gradientTo: string;
    glow: string;
  };
} = {
  // Semantic risk colors. Text/border carry the meaning; fills stay low-opacity
  // so cards read as Linear surfaces with a colored accent, not saturated blocks.
  [RiskLevel.High]: {
    text: "text-danger",
    bg: "bg-danger/10",
    border: "border-danger/40",
    gradientFrom: "from-danger/20",
    gradientTo: "to-transparent",
    glow: "hover:shadow-danger/20",
  },
  [RiskLevel.Medium]: {
    text: "text-warning",
    bg: "bg-warning/10",
    border: "border-warning/40",
    gradientFrom: "from-warning/20",
    gradientTo: "to-transparent",
    glow: "hover:shadow-warning/20",
  },
  [RiskLevel.Low]: {
    text: "text-success",
    bg: "bg-success/10",
    border: "border-success/40",
    gradientFrom: "from-success/20",
    gradientTo: "to-transparent",
    glow: "hover:shadow-success/20",
  },
  [RiskLevel.Negligible]: {
    text: "text-primary",
    bg: "bg-primary/10",
    border: "border-primary/40",
    gradientFrom: "from-primary/20",
    gradientTo: "to-transparent",
    glow: "hover:shadow-primary/20",
  },
  [RiskLevel.NoRisk]: {
    text: "text-ink-subtle",
    bg: "bg-surface-2",
    border: "border-hairline",
    gradientFrom: "from-surface-2",
    gradientTo: "to-transparent",
    glow: "hover:shadow-black/20",
  },
};
