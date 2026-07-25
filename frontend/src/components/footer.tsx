import React from "react";
import Link from "next/link";
import { LogoIcon } from "./Icons";
import { APP_NAME } from "@/constants";

const productLinks = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Pricing", href: "/pricing" },
  { label: "Find a Lawyer", href: "/lawyers" },
  { label: "Upload a Document", href: "/upload" },
];

const legalLinks = [
  { label: "Terms of Service", href: "/terms" },
  { label: "Privacy Policy", href: "/privacy" },
];

const Footer = () => {
  return (
    <footer className="border-t border-hairline bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand column */}
          <div className="sm:col-span-2 lg:col-span-2 flex flex-col gap-3">
            <div className="flex items-center gap-2">
              <LogoIcon className="h-6 w-6 text-primary" />
              <span className="text-base font-semibold text-ink tracking-tight">
                {APP_NAME}
              </span>
            </div>
            <p className="text-sm text-ink-muted max-w-sm">
              AI-powered contract analysis and negotiation support.
            </p>
            <p className="text-xs text-ink-tertiary max-w-sm">
              {APP_NAME} is not a substitute for legal counsel.
            </p>
          </div>

          {/* Product column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Product
            </h3>
            <ul className="flex flex-col gap-2">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-muted hover:text-ink transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Legal column */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">
              Legal
            </h3>
            <ul className="flex flex-col gap-2">
              {legalLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-ink-muted hover:text-ink transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-hairline flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-2 text-center sm:text-left">
          <p className="text-xs text-ink-tertiary">
            &copy; {new Date().getFullYear()} {APP_NAME}. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
