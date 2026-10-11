"use client";

import React from "react";
import Link from "next/link";

interface BackLinkProps {
  href?: string;
  onClick?: () => void;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Consistent "go back" affordance used across app pages: an icon chip with
 * a chevron plus label, replacing the old plain-text "&larr; Back" links.
 * Pass either `href` (renders a Link) or `onClick` (renders a button).
 */
const BackLink: React.FC<BackLinkProps> = ({
  href,
  onClick,
  children = "Back",
  className = "",
}) => {
  const content = (
    <span
      className={`group inline-flex items-center gap-1.5 text-sm font-medium text-ink-subtle transition-colors duration-200 hover:text-ink cursor-pointer ${className}`}
    >
      <span
        className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-hairline bg-surface-1 transition-all duration-200 group-hover:-translate-x-0.5 group-hover:border-hairline-strong group-hover:bg-surface-2"
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
      </span>
      {children}
    </span>
  );

  if (href) {
    return (
      <Link href={href} className="inline-flex">
        {content}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className="inline-flex">
      {content}
    </button>
  );
};

export default BackLink;
