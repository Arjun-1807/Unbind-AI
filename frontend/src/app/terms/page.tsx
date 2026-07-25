import type { Metadata } from "next";
import Header from "@/components/Header";
import Footer from "@/components/footer";
import BackLink from "@/components/BackLink";

export const metadata: Metadata = {
  title: "Terms of Service | UnBind",
  description:
    "Terms and Conditions governing use of UnBind, the AI-powered legal contract analysis platform.",
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

export default function TermsPage() {
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
              Terms of Service
            </h1>
            <p className="mt-3 text-sm text-ink-subtle">
              Last updated: [Date]
            </p>
            <p className="mt-4 text-base sm:text-lg text-ink-subtle max-w-2xl">
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access
              to and use of UnBind, an AI-powered legal contract analysis
              platform. Please read them carefully before using the service.
            </p>
          </div>

          <div className="space-y-6">
            <Section id="acceptance" title="1. Acceptance of Terms">
              <p>
                By creating an account, accessing, or using UnBind (the
                &ldquo;Service&rdquo;), you agree to be bound by these Terms
                and by our Privacy Policy. If you do not agree to these Terms,
                you must not access or use the Service. If you are using the
                Service on behalf of an organization, you represent that you
                have the authority to bind that organization to these Terms.
              </p>
            </Section>

            <Section id="description" title="2. Description of Service">
              <p>
                UnBind lets you upload legal contracts and documents (including
                PDFs and images processed via optical character recognition
                and vision-language models) and runs AI-powered analysis on
                them. Features include, without limitation: clause-level risk
                analysis, a negotiation helper, a key-terms glossary, key-date
                extraction, an &ldquo;impact simulator&rdquo; for modeling
                what-if scenarios, and a clause-rewrite / document-comparison
                tool that lets you accept or reject AI-suggested rewrites and
                download a revised document.
              </p>
              <p>
                We may add, change, or remove features at any time, and we do
                not guarantee that any specific feature will remain available
                indefinitely.
              </p>
            </Section>

            <Section
              id="no-legal-advice"
              title="3. Not Legal Advice / No Attorney-Client Relationship"
            >
              <div className="rounded-lg border border-hairline-strong bg-surface-2 p-4 space-y-3">
                <p className="text-ink font-semibold">
                  UnBind is not a law firm, does not employ your attorney, and
                  does not provide legal advice.
                </p>
                <p>
                  All outputs of the Service — including risk assessments,
                  negotiation suggestions, glossary explanations, key-date
                  extractions, impact-simulation results, and clause rewrites
                  — are generated for informational purposes only and are{" "}
                  <span className="font-semibold text-ink">
                    not a substitute for advice from a licensed attorney
                  </span>
                  . Using the Service does not create an attorney-client
                  relationship between you and UnBind, its operators,
                  employees, or contractors.
                </p>
                <p>
                  You should consult a licensed attorney qualified in the
                  relevant jurisdiction before making any legal, financial, or
                  business decision based on information obtained from the
                  Service. UnBind expressly disclaims any responsibility for
                  decisions made in reliance on the Service without
                  independent legal review.
                </p>
              </div>
            </Section>

            <Section
              id="eligibility"
              title="4. Eligibility &amp; Accounts"
            >
              <p>
                You must be at least 18 years old, or the age of legal
                majority in your jurisdiction, and have the legal capacity to
                enter into a binding contract to use the Service. By using
                the Service, you represent that you meet these requirements.
              </p>
              <p>
                You may create an account with a username, email address, and
                password, or by signing in with Google OAuth. Passwords are
                stored in hashed form; we do not have access to your
                plaintext password. You are responsible for maintaining the
                confidentiality of your account credentials and for all
                activity that occurs under your account. Notify us
                immediately of any unauthorized use of your account or any
                other breach of security.
              </p>
            </Section>

            <Section
              id="billing"
              title="5. Subscriptions, Billing &amp; Payments"
            >
              <p>
                UnBind offers paid subscription plans with additional usage
                limits and features. Payments are processed through
                Razorpay, a third-party payment gateway. Your use of
                Razorpay&rsquo;s payment services is subject to
                Razorpay&rsquo;s own terms of service and privacy policy, and
                UnBind is not responsible for the operation of Razorpay&rsquo;s
                systems or for any errors, delays, or failures in payment
                processing caused by Razorpay or your bank or card issuer.
              </p>
              <p>
                Subscriptions renew automatically for successive billing
                periods unless cancelled before the renewal date. You may
                change or cancel your plan at any time through your account
                settings; changes take effect as described at the time of
                cancellation or downgrade. Refunds, if any, are handled on a
                case-by-case basis in accordance with the plan terms
                presented to you at purchase and at UnBind&rsquo;s sole
                discretion. We do not guarantee refunds for partial billing
                periods or unused features.
              </p>
            </Section>

            <Section
              id="user-content"
              title="6. User Content &amp; Ownership"
            >
              <p>
                &ldquo;User Content&rdquo; means any document, contract,
                image, or other material you upload to the Service. As
                between you and UnBind, you retain all ownership rights and
                title to your User Content. We do not claim ownership of the
                documents you upload.
              </p>
              <p>
                By uploading User Content, you grant UnBind a limited,
                non-exclusive, revocable license to access, store, process,
                and transmit that content solely for the purpose of providing
                and improving the Service to you (for example, running OCR,
                AI analysis, and generating rewrites or reports). This license
                ends when your content is deleted from our systems, except to
                the extent retention is required by law or for backup and
                security purposes.
              </p>
              <p>
                AI-generated output produced from your User Content (risk
                analyses, rewrites, summaries, and similar work product) is
                made available to you for your use in connection with the
                Service. You are responsible for ensuring you have the
                necessary rights to upload and process any document through
                the Service.
              </p>
            </Section>

            <Section
              id="ai-disclaimer"
              title="7. AI-Generated Content Disclaimer"
            >
              <p>
                The Service uses artificial intelligence, including large
                language models and vision-language models, to analyze
                documents and generate output. AI-generated content is
                provided &ldquo;as is&rdquo; and may contain errors,
                omissions, or inaccuracies. AI models can misinterpret
                clauses, miss risks, hallucinate information, or produce
                incomplete analysis.
              </p>
              <p>
                UnBind does not guarantee the accuracy, completeness,
                reliability, or fitness for any particular purpose of any
                AI-generated output, including risk assessments, negotiation
                suggestions, key-term or key-date extractions, impact
                simulations, or suggested clause rewrites. You must
                independently verify any AI-generated output, and any
                document you download or rely on after using the clause
                rewrite or compare-documents feature, before relying on it
                or acting upon it.
              </p>
            </Section>

            <Section id="acceptable-use" title="8. Acceptable Use Policy">
              <p>You agree that you will not:</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Upload any document or content that you do not have the
                  legal right to upload, share, or process, including content
                  that infringes the intellectual property or confidentiality
                  rights of any third party;
                </li>
                <li>
                  Use the Service for any unlawful purpose or in violation of
                  any applicable local, state, national, or international
                  law or regulation;
                </li>
                <li>
                  Attempt to reverse-engineer, decompile, probe, scrape, or
                  otherwise abuse the AI models, pipelines, or infrastructure
                  underlying the Service, or attempt to circumvent usage
                  limits, rate limits, or plan restrictions;
                </li>
                <li>
                  Use the Service to build a competing product or to train a
                  competing AI model on output obtained from the Service;
                </li>
                <li>
                  Upload malicious files, attempt to introduce malware, or
                  otherwise interfere with or disrupt the integrity or
                  performance of the Service; or
                </li>
                <li>
                  Impersonate any person or entity, or misrepresent your
                  affiliation with any person or entity, in connection with
                  your use of the Service.
                </li>
              </ul>
              <p>
                We reserve the right to investigate and take appropriate
                action against anyone who, in our sole discretion, violates
                this policy, including removing content and suspending or
                terminating accounts.
              </p>
            </Section>

            <Section
              id="lawyer-directory"
              title="9. Third-Party Lawyer Directory Disclaimer"
            >
              <p>
                UnBind offers a &ldquo;Find a Lawyer&rdquo; directory that
                connects users with independent, third-party lawyers who may
                register to be listed on the platform. UnBind does not
                employ, supervise, verify the credentials of, or control the
                advice given by, any lawyer listed in the directory beyond
                any basic verification steps we may choose to apply.
              </p>
              <p>
                Any engagement, communication, or agreement you enter into
                with a lawyer found through the directory is solely between
                you and that lawyer. UnBind is not a party to that engagement,
                does not review or approve the advice or services provided,
                and is not responsible or liable for any act, omission,
                advice, fee dispute, or outcome arising from your interaction
                with any lawyer listed in the directory. Your use of the
                lawyer directory, and any relationship formed through it, is
                at your own risk.
              </p>
            </Section>

            <Section
              id="intellectual-property"
              title="10. Intellectual Property"
            >
              <p>
                The Service, including its software, AI models and
                pipelines, user interface, design, branding, logos, and the
                &ldquo;UnBind&rdquo; name and marks, are the property of
                UnBind and its licensors and are protected by intellectual
                property laws. Except for the limited rights expressly
                granted to you to use the Service, no other rights are
                granted to you, whether by implication, estoppel, or
                otherwise.
              </p>
              <p>
                You may not copy, modify, distribute, sell, or lease any part
                of the Service, nor may you reverse-engineer or attempt to
                extract the source code of the Service, unless applicable
                law prohibits these restrictions or you have our prior
                written permission.
              </p>
            </Section>

            <Section id="termination" title="11. Termination">
              <p>
                You may stop using the Service and close your account at any
                time. We may suspend or terminate your access to the Service,
                in whole or in part, at any time and without prior notice if
                we believe you have violated these Terms, misused the
                Service, created risk or legal exposure for us, or for any
                other reason at our discretion, including discontinuation of
                the Service.
              </p>
              <p>
                Upon termination, your right to use the Service will
                immediately cease. Sections of these Terms that by their
                nature should survive termination (including, without
                limitation, ownership, disclaimers, limitation of liability,
                and indemnification) will survive.
              </p>
            </Section>

            <Section
              id="warranties"
              title="12. Disclaimer of Warranties"
            >
              <p>
                THE SERVICE, INCLUDING ALL AI-GENERATED OUTPUT, IS PROVIDED
                ON AN &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo;
                BASIS, WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS,
                IMPLIED, OR STATUTORY, INCLUDING BUT NOT LIMITED TO IMPLIED
                WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
                PURPOSE, TITLE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT
                THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE, OR
                THAT ANY AI-GENERATED ANALYSIS OR OUTPUT WILL BE ACCURATE,
                COMPLETE, OR RELIABLE.
              </p>
            </Section>

            <Section
              id="liability"
              title="13. Limitation of Liability"
            >
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, UNBIND AND ITS
                OFFICERS, EMPLOYEES, AND CONTRACTORS WILL NOT BE LIABLE FOR
                ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE
                DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, DATA, OR
                GOODWILL, ARISING OUT OF OR RELATED TO YOUR USE OF, OR
                INABILITY TO USE, THE SERVICE, INCLUDING ANY DECISION MADE OR
                ACTION TAKEN IN RELIANCE ON AI-GENERATED OUTPUT. OUR TOTAL
                AGGREGATE LIABILITY FOR ANY CLAIM ARISING FROM THESE TERMS OR
                THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID TO UNBIND FOR
                THE SERVICE IN THE TWELVE (12) MONTHS PRECEDING THE CLAIM.
              </p>
            </Section>

            <Section id="indemnification" title="14. Indemnification">
              <p>
                You agree to indemnify, defend, and hold harmless UnBind and
                its officers, employees, and contractors from and against any
                claims, liabilities, damages, losses, and expenses, including
                reasonable legal fees, arising out of or in any way connected
                with: (a) your access to or use of the Service; (b) your User
                Content; (c) your violation of these Terms; or (d) your
                violation of any rights of a third party, including any
                lawyer engaged through the lawyer directory.
              </p>
            </Section>

            <Section
              id="governing-law"
              title="15. Governing Law &amp; Dispute Resolution"
            >
              <p>
                These Terms are governed by and construed in accordance with
                the laws of{" "}
                <span className="font-semibold text-ink bg-primary/10 px-1.5 py-0.5 rounded">
                  [Governing Law Jurisdiction — to be finalized by Legal]
                </span>
                , without regard to conflict-of-laws principles. Any dispute
                arising out of or relating to these Terms or the Service will
                be subject to the exclusive jurisdiction of the courts
                located in{" "}
                <span className="font-semibold text-ink bg-primary/10 px-1.5 py-0.5 rounded">
                  [Governing Law Jurisdiction — to be finalized by Legal]
                </span>
                , unless otherwise required by applicable law.
              </p>
            </Section>

            <Section
              id="changes"
              title="16. Changes to These Terms"
            >
              <p>
                We may update these Terms from time to time to reflect
                changes to the Service, legal requirements, or our business
                practices. If we make material changes, we will update the
                &ldquo;Last updated&rdquo; date above and, where appropriate,
                provide additional notice (such as an in-app notification or
                email). Your continued use of the Service after changes take
                effect constitutes acceptance of the revised Terms.
              </p>
            </Section>

            <Section id="contact" title="17. Contact">
              <p>
                If you have questions about these Terms, please contact us
                at{" "}
                <a
                  href="mailto:legal@unbind.ai"
                  className="text-primary font-medium hover:underline"
                >
                  legal@unbind.ai
                </a>
                .
              </p>
              <p className="text-xs text-ink-subtle italic">
                Placeholder contact — replace with your real support/legal
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
