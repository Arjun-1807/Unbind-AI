/** @type {import('next').NextConfig} */
const rawBackendUrl =
  process.env.BACKEND_API_URL ||
  (process.env.NODE_ENV === "production"
    ? "https://unbind-backend.vercel.app"
    : "http://localhost:8000");

const BACKEND_URL = rawBackendUrl.replace(/\/+$/, "").replace(/\/api$/, "");

const IS_DEV = process.env.NODE_ENV !== "production";

/**
 * Content-Security-Policy. This is the defence-in-depth half of moving the
 * session credential into an httpOnly cookie: the cookie stops a successful
 * XSS from *stealing* the token, and the CSP shrinks the set of ways such a
 * script can get injected or phone anything home in the first place.
 *
 * Every allowance below is here because something in this app needs it:
 *
 *  - `script-src 'unsafe-inline'`: Next.js App Router streams hydration data as
 *    inline `<script>self.__next_f.push(...)</script>` tags with no nonce.
 *    Nonces require a `middleware.ts` that stamps a fresh value per response,
 *    which also opts every route out of static rendering — so this stays until
 *    that trade is made deliberately. Browsers ignore 'unsafe-inline' whenever
 *    a nonce or hash is present, so adding one later is a drop-in change.
 *  - `'unsafe-eval'` in development only: the webpack dev server evaluates
 *    modules via eval() for HMR. Production must not have it. pdf.js probes
 *    eval support in a try/catch and falls back cleanly when it is blocked.
 *  - accounts.google.com: Google Identity Services (@react-oauth/google) loads
 *    gsi/client and renders the sign-in button + One Tap prompt in an iframe.
 *  - checkout.razorpay.com / *.razorpay.com: Razorpay Checkout is injected from
 *    their CDN by src/lib/razorpay.ts, frames its payment UI into the page, and
 *    posts telemetry to lumberjack.razorpay.com.
 *  - cdnjs.cloudflare.com: src/components/OverlayRephrasedPdf.tsx points
 *    pdfjs' GlobalWorkerOptions.workerSrc at the CDN-hosted pdf.worker.
 *  - BACKEND_URL in connect-src: SSE/streaming uploads bypass the rewrite proxy
 *    below and hit the backend origin directly (see NEXT_PUBLIC_BACKEND_ORIGIN).
 *  - `img-src https:`: OAuth avatars come from arbitrary provider hosts, and
 *    blob: covers the canvas/PDF previews.
 */
const scriptSrc = [
  "'self'",
  "'unsafe-inline'",
  ...(IS_DEV ? ["'unsafe-eval'"] : []),
  "https://accounts.google.com",
  "https://checkout.razorpay.com",
  "https://cdnjs.cloudflare.com",
  // @vercel/analytics + @vercel/speed-insights self-host their script from
  // /_vercel/* on Vercel, but fall back to this origin elsewhere and in dev.
  "https://va.vercel-scripts.com",
];

const connectSrc = [
  ...new Set([
    "'self'",
    BACKEND_URL,
    "https://accounts.google.com",
    "https://api.razorpay.com",
    "https://lumberjack.razorpay.com",
    "https://*.razorpay.com",
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    // Dev only: webpack HMR's websocket, and the local backend the SSE upload
    // talks to directly when BACKEND_API_URL points somewhere else.
    ...(IS_DEV ? ["ws:", "http://localhost:8000"] : []),
  ]),
];

const cspDirectives = [
  "default-src 'self'",
  `script-src ${scriptSrc.join(" ")}`,
  // Tailwind/Next inject inline <style> tags; there is no nonce for them.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  `connect-src ${connectSrc.join(" ")}`,
  "frame-src 'self' https://accounts.google.com https://checkout.razorpay.com https://api.razorpay.com",
  "worker-src 'self' blob: https://cdnjs.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // Modern equivalent of the X-Frame-Options below; both are sent so older
  // browsers that ignore frame-ancestors are still covered.
  "frame-ancestors 'none'",
  ...(IS_DEV ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: cspDirectives },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
];

const nextConfig = {
  // Exposes the resolved backend origin to client code (e.g. for SSE fetches
  // that must bypass the rewrite proxy below, which buffers responses).
  env: {
    NEXT_PUBLIC_BACKEND_ORIGIN: BACKEND_URL,
  },
  async headers() {
    return [
      {
        // Every route, including the /api/* rewrites below.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
