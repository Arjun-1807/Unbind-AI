"use client";

import React from "react";
import { AlertCircleIcon } from "./Icons";

interface ErrorMessageProps {
  message: string;
  onRetry: () => void;
  title?: string;
  retryLabel?: string;
}

const ErrorMessage: React.FC<ErrorMessageProps> = ({
  message,
  onRetry,
  title = "Analysis Failed",
  retryLabel = "Try Again",
}) => {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-danger/10 border border-danger/40 p-6 rounded-lg max-w-lg">
        <div className="flex flex-col items-center">
          <AlertCircleIcon className="h-12 w-12 text-danger mb-4" />
          <h3 className="text-xl font-semibold text-danger mb-2">{title}</h3>
          <p className="text-ink-muted mb-6">{message}</p>
          <button
            onClick={onRetry}
            className="px-6 py-2 font-medium text-white bg-danger rounded-md hover:bg-danger/90 transition-colors"
          >
            {retryLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ErrorMessage;
