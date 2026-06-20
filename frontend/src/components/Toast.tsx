"use client";

import React, { useEffect } from "react";

// ─── X close icon (matches ContactModal) ────────────────────────────────────
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

// ─── Warning / document icon ─────────────────────────────────────────────────
const DocumentWarningIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className="h-10 w-10 text-amber-400"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v3.75m0 3.75h.008v.008H12v-.008z"
    />
  </svg>
);

interface ToastProps {
  message: string;
  onRetry: () => void;
  autoClose?: boolean;
  autoCloseDuration?: number;
}

const Toast: React.FC<ToastProps> = ({
  message,
  onRetry,
  autoClose = false,
  autoCloseDuration = 5000,
}) => {
  const [isVisible, setIsVisible] = React.useState(true);

  useEffect(() => {
    if (autoClose) {
      const timer = setTimeout(() => {
        setIsVisible(false);
        onRetry();
      }, autoCloseDuration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDuration, onRetry]);

  // Escape key closes the modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsVisible(false);
        onRetry();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onRetry]);

  if (!isVisible) return null;

  const handleClose = () => {
    setIsVisible(false);
    onRetry();
  };

  return (
    // Backdrop — identical to ContactModal
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      {/* Card — identical glass-card + rounded-2xl sizing from ContactModal */}
      <div className="w-full max-w-sm glass-card rounded-2xl p-8 text-center relative fade-in">
        {/* Close button — top-right, same as ContactModal */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors cursor-pointer"
          aria-label="Close"
        >
          <XIcon />
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="h-16 w-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <DocumentWarningIcon />
          </div>
        </div>

        {/* Title */}
        <h3 className="text-xl font-bold text-white mb-2">Not a Legal Document</h3>

        {/* Message */}
        <p className="text-sm text-gray-400 mb-6 leading-relaxed">{message}</p>

        {/* Retry button — same style as ContactModal's primary action */}
        <button
          onClick={handleClose}
          className="w-full inline-flex justify-center items-center px-4 py-2 font-semibold text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-colors text-sm shadow-lg cursor-pointer"
        >
          Retry
        </button>
      </div>
    </div>
  );
};

export default Toast;
