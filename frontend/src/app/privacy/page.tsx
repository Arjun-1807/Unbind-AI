import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/footer";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Privacy Policy | UnBind",
  description:
    "How UnBind collects, uses, and protects your information across account, document analysis, and payment features.",
};

interface SectionProps {
  id: string;
  title: string;
  children: React.ReactNode;
}

function Section({ id, title, children }: SectionProps) {
  return (
    <section id={id} className="ln-card p-6 sm:p-8 scroll-mt-24">
      <h2 className="text-lg sm:text-xl font-semibold text-ink mb-4">
        {title}
      </h2>
      <div className="space-y-4 text-sm sm:text-base text-ink-muted leading-relaxed">
        {children}
      </div>
    </section>
  );
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen font-sans">
      <Header />
      <main className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10 max-w-4xl">
        <div className="space-y-8 fade-in">
          <div>
            <BackLink href="/" />
          </div>

          <div>
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight text-ink">
              Privacy Policy
            </h1>
            <p className="mt-3 text-sm text-ink-subtle">
              Last updated: [Date]
            </p>
            <p className="mt-4 text-base sm:text-lg text-ink-subtle max-w-2xl">
              This Privacy Policy explains what information UnBind
              (&ldquo;UnBind&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) collects
              when you use our AI-powered legal contract analysis platform (the
              &ldquo;Service&rdquo;), how we use it, and the choices you have.
              Please read this alongside our{" "}
              <a
                href="/terms"
                className="text-primary font-medium hover:underline"
              >
                Terms of Service
              </a>
              .
            </p>
          </div>

          <div className="space-y-6">
            <Section id="scope" title="1. Introduction &amp; Scope">
              <p>
                This Policy applies to information collected through the
                UnBind website and application, including account creation,
                sign-in, document upload and analysis, the negotiation and
                impact-simulator features, and payment for paid plans. By
                using the Service, you agree to the collection and use of
                information as described here.
              </p>
            </Section>

            <Section
              id="information-we-collect"
              title="2. Information We Collect"
            >
              <p className="font-semibold text-ink">
                a. Account information
              </p>
              <p>
                When you create an account directly, we collect the username,
                email address, and password you provide. Your password is
                never stored in plain text — it is hashed (via bcrypt) before
                being saved, and we cannot recover or view your original
                password. If you sign in with Google, we instead receive
                basic profile information from Google — your name, email
                address, and profile picture — and do not receive or store
                your Google password.
              </p>
              <p className="font-semibold text-ink">b. User Content</p>
              <p>
                &ldquo;User Content&rdquo; means the contracts, agreements,
                and other documents or images you upload for analysis,
                together with the text extracted from them (including via
                optical character recognition of photos and scans).{" "}
                <span className="font-semibold text-ink">
                  User Content may contain sensitive, confidential, or
                  personal information
                </span>{" "}
                — for example, names, addresses, financial terms, or
                information about third parties named in your documents. You
                should only upload documents you have the right to share, and
                you should consider redacting information you do not want
                processed if it is not necessary for the analysis you need.
              </p>
              <p className="font-semibold text-ink">c. Payment information</p>
              <p>
                Paid plans are processed through Razorpay, our third-party
                payment processor. UnBind does not receive, process, or store
                your full card number, CVV, UPI credentials, or other raw
                payment credentials — Razorpay collects and handles that
                information directly. We store limited, non-sensitive billing
                records on our side, such as the plan purchased, amount and
                currency charged, Razorpay&rsquo;s order and payment
                identifiers, and the transaction date, so we can show you
                your billing history and confirm plan activation.
              </p>
              <p className="font-semibold text-ink">
                d. Usage &amp; analytics data
              </p>
              <p>
                We use Vercel Analytics and Vercel Speed Insights to
                understand how the Service is used and performing. These
                tools collect aggregated, privacy-conscious usage data such
                as page views, referring pages, device/browser type, and
                performance metrics (e.g. page load times). This helps us
                identify issues and improve the Service.
              </p>
              <p className="font-semibold text-ink">
                e. Cookies &amp; session tokens
              </p>
              <p>
                When you sign in, we issue a signed authentication token
                (JSON Web Token) that is stored in an HTTP-only cookie in
                your browser (or, for some clients, sent as a bearer token)
                so the Service can recognize you as signed in across
                requests. This cookie is used strictly for authentication and
                session management, is marked secure in production, and is
                not used to track you across other websites. See Section 11
                for more on cookies.
              </p>
            </Section>

            <Section id="how-we-use" title="3. How We Use Your Information">
              <p>We use the information described above to:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Provide and operate the Service, including creating and
                  authenticating your account, running document analysis,
                  the negotiation helper, and the impact simulator;
                </li>
                <li>
                  Process payments and subscriptions, and maintain your
                  billing history and plan status;
                </li>
                <li>
                  Maintain the security of your account and the Service,
                  including detecting and preventing fraud, abuse, and
                  unauthorized access;
                </li>
                <li>
                  Send you transactional communications, such as payment
                  receipts and account-related notices; and
                </li>
                <li>
                  Understand aggregated usage patterns and performance via
                  analytics, in order to maintain and improve the Service.
                </li>
              </ul>
            </Section>

            <Section
              id="ai-processing"
              title="4. How Your Document Content Is Processed by AI"
            >
              <p>
                <span className="font-semibold text-ink">
                  This is the most important data flow to understand before
                  you upload a document.
                </span>{" "}
                To generate clause-level risk analysis, plain-language
                summaries, key terms and dates, negotiation drafts, and
                impact-simulation answers, the text of your uploaded document
                (and, where relevant, the text transcribed from uploaded
                images or scans) is transmitted to Groq, a third-party AI
                inference provider, so that a large language model can
                process it and return the analysis. Photographed or scanned
                documents are additionally sent, as images, to a Groq vision
                model for optical character recognition before analysis.
              </p>
              <p>
                This transmission to Groq is necessary for the core analysis
                features of the Service to function — there is currently no
                way to run the analysis without sending the relevant document
                text (and, for image uploads, the image itself) to Groq for
                inference. We do not control Groq&rsquo;s infrastructure and
                Groq processes this content subject to its own terms and
                privacy policy.
              </p>
              <p>
                Separately, the &ldquo;impact simulator&rdquo; feature also
                sends short excerpts of your document text to a third-party
                hosted embedding API (via Hugging Face&rsquo;s Inference API)
                so that relevant passages can be matched to your question. We
                may also use LangSmith, a tracing/observability tool, to log
                prompts and model responses for debugging and quality
                monitoring of our AI pipelines; such traces can include
                excerpts of document text processed in that request.
              </p>
            </Section>

            <Section
              id="third-parties"
              title="5. Third-Party Service Providers"
            >
              <p>
                We rely on the following third-party service providers, each
                of which acts as a data processor on our behalf and is
                subject to its own privacy policy:
              </p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  <span className="font-semibold text-ink">Groq</span> —
                  AI inference for document analysis, clause risk detection,
                  negotiation drafting, and vision-based OCR (see Section 4).
                </li>
                <li>
                  <span className="font-semibold text-ink">Hugging Face</span>{" "}
                  — hosted inference API used to generate text embeddings for
                  the impact-simulator&rsquo;s retrieval feature.
                </li>
                <li>
                  <span className="font-semibold text-ink">LangSmith</span> —
                  optional tracing and observability of our AI pipeline calls,
                  used for debugging and quality monitoring.
                </li>
                <li>
                  <span className="font-semibold text-ink">Razorpay</span> —
                  payment processing for paid plans (see Section 2c).
                </li>
                <li>
                  <span className="font-semibold text-ink">Google</span> —
                  optional Google OAuth sign-in, used only to authenticate you
                  and retrieve basic profile information you choose to share.
                </li>
                <li>
                  <span className="font-semibold text-ink">Vercel</span> —
                  hosting of the Service, plus Vercel Analytics and Speed
                  Insights (see Section 2d).
                </li>
              </ul>
              <p>
                We do not sell your personal information to third parties for
                their own marketing purposes.
              </p>
            </Section>

            <Section id="retention" title="6. Data Retention">
              <p>
                We retain your account information, uploaded documents, and
                the analysis results generated from them for as long as your
                account remains active, so that you can access your history
                and dashboard and revisit past analyses. Billing records are
                retained as part of your account&rsquo;s payment history.
              </p>
              <p>
                If you delete your account, we work to remove or
                de-identify the associated account data and User Content from
                our active systems, except where we are required to retain
                certain records (for example, payment records) for legal,
                accounting, or fraud-prevention purposes, or where data
                persists for a limited time in backups before being purged in
                the ordinary course of our backup cycle.
              </p>
            </Section>

            <Section id="security" title="7. Data Security">
              <p>
                We use reasonable technical and organizational measures to
                protect your information, including hashing passwords (so we
                never store them in plain text), transmitting data over
                encrypted connections, and using signed, HTTP-only
                authentication tokens for sessions. Payment credentials are
                handled directly by Razorpay rather than by our own systems.
              </p>
              <p>
                No method of transmission or storage is 100% secure, and we
                cannot guarantee absolute security. If you believe your
                account has been compromised, please contact us immediately
                using the details in Section 13.
              </p>
            </Section>

            <Section id="your-rights" title="8. Your Rights">
              <p>
                Depending on your location, you may have rights to access,
                correct, or delete the personal information we hold about
                you, to obtain a copy of it, or to object to or restrict
                certain processing. You can update basic account details from
                within the Service, and you can request access, correction,
                deletion of your account and associated data, or answers to
                other privacy questions by contacting us at{" "}
                <a
                  href="mailto:privacy@unbind.ai"
                  className="text-primary font-medium hover:underline"
                >
                  privacy@unbind.ai
                </a>{" "}
                (placeholder — replace with your real privacy contact before
                publishing). We will respond to verifiable requests within a
                reasonable timeframe.
              </p>
            </Section>

            <Section id="children" title="9. Children&rsquo;s Privacy">
              <p>
                The Service is not directed to children under the age of 13
                (or 16, where a higher threshold applies under local law), and
                we do not knowingly collect personal information from
                children. If you believe a child has provided us with
                personal information, please contact us so we can take
                appropriate action, including deleting that information.
              </p>
            </Section>

            <Section
              id="international-transfers"
              title="10. International Data Transfers"
            >
              <p>
                Because we use third-party service providers (see Section 5),
                your information, including User Content, may be processed
                or stored in countries other than your own, which may have
                different data protection laws than your jurisdiction. Where
                this occurs, we take steps intended to ensure your
                information continues to receive an appropriate level of
                protection wherever it is processed.
              </p>
            </Section>

            <Section
              id="cookies"
              title="11. Cookies &amp; Tracking Technologies"
            >
              <p>
                We use an essential, HTTP-only authentication cookie to keep
                you signed in and to identify your account on subsequent
                requests (see Section 2e). We also use Vercel Analytics and
                Speed Insights, which may set or read limited technical
                identifiers/cookies in your browser to measure aggregated
                usage and performance. We do not use cookies for third-party
                behavioral advertising. You can control cookies through your
                browser settings, but blocking the authentication cookie will
                prevent you from staying signed in.
              </p>
            </Section>

            <Section id="changes" title="12. Changes to This Privacy Policy">
              <p>
                We may update this Privacy Policy from time to time to
                reflect changes to the Service, the third parties we rely on,
                or legal requirements. If we make material changes, we will
                update the &ldquo;Last updated&rdquo; date above and, where
                appropriate, provide additional notice (such as an in-app
                notification or email). Your continued use of the Service
                after changes take effect constitutes acceptance of the
                revised Policy.
              </p>
            </Section>

            <Section id="contact" title="13. Contact Us">
              <p>
                If you have questions about this Privacy Policy or how we
                handle your information, please contact us at{" "}
                <a
                  href="mailto:privacy@unbind.ai"
                  className="text-primary font-medium hover:underline"
                >
                  privacy@unbind.ai
                </a>
                .
              </p>
              <p className="text-xs text-ink-subtle italic">
                Placeholder contact — replace with your real privacy/support
                contact before publishing.
              </p>
            </Section>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
