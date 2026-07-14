"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";

// ─── X close icon (matches Toast / ContactModal) ────────────────────────────
const XIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-5 w-5"
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

// ─── Trash icon ──────────────────────────────────────────────────────────────
const TrashIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-9 w-9 text-danger"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
    />
  </svg>
);

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const ConfirmModal: React.FC<ConfirmModalProps> = ({
  open,
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  loading = false,
  onConfirm,
  onCancel,
}) => {
  // Portal target is only available on the client; track mount to avoid SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape key cancels (ignored while an action is in flight).
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) onCancel();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, loading, onCancel]);

  // Lock background scroll while the modal is open.
  useEffect(() => {
    if (!open) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = original;
    };
  }, [open]);

  if (!open || !mounted) return null;

  // Render into <body> via a portal so the fixed overlay covers the whole
  // viewport and isn't trapped by a transformed ancestor (e.g. `.fade-in`).
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onCancel();
      }}
    >
      <div className="w-full max-w-sm ln-card rounded-2xl p-6 sm:p-8 text-center relative fade-in">
        {/* Close button */}
        <button
          onClick={onCancel}
          disabled={loading}
          className="absolute top-4 right-4 text-ink-subtle hover:text-ink transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          aria-label="Close"
        >
          <XIcon />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-danger/10 border border-danger/20 flex items-center justify-center">
            <TrashIcon />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-lg sm:text-xl font-semibold text-ink mb-2">{title}</h3>

        {/* Message */}
        <p className="text-sm text-ink-subtle mb-6 leading-relaxed">{message}</p>

        {/* Actions — stack on mobile, side-by-side on larger screens */}
        <div className="flex flex-col-reverse sm:flex-row gap-3">
          <button
            onClick={onCancel}
            disabled={loading}
            className="w-full inline-flex justify-center items-center px-4 py-2 text-sm cursor-pointer ln-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className="w-full inline-flex justify-center items-center px-4 py-2 font-semibold text-white bg-danger rounded-md hover:bg-danger/90 transition-colors text-sm cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {loading ? "Deleting…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default ConfirmModal;
