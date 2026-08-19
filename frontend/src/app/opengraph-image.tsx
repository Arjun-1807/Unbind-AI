import { ImageResponse } from "next/og";
import { SITE_NAME, SITE_TAGLINE } from "@/lib/site";

// Generated at build time via next/og, so the link-preview card is part of the
// deploy rather than a static asset somebody has to remember to re-export when
// the wording changes. Palette matches globals.css (canvas #010102, accent
// #5e6ad2).
export const alt = `${SITE_NAME} — ${SITE_TAGLINE}`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background: "linear-gradient(135deg, #010102 0%, #12121c 55%, #1d1d33 100%)",
          color: "#f7f8f8",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            fontSize: 34,
            fontWeight: 600,
            color: "#8b8fd6",
          }}
        >
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 999,
              background: "#5e6ad2",
              display: "flex",
            }}
          />
          {SITE_NAME}
        </div>
        <div
          style={{
            marginTop: 28,
            fontSize: 82,
            fontWeight: 700,
            lineHeight: 1.05,
            letterSpacing: "-0.03em",
            display: "flex",
          }}
        >
          Know what you&apos;re signing.
        </div>
        <div
          style={{
            marginTop: 30,
            fontSize: 36,
            lineHeight: 1.35,
            color: "#9c9fa6",
            maxWidth: 900,
            display: "flex",
          }}
        >
          Clause-by-clause contract risk analysis, in plain English.
        </div>
      </div>
    ),
    size,
  );
}
