"use client";

import React, { useEffect } from "react";

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
      }, autoCloseDuration);
      return () => clearTimeout(timer);
    }
  }, [autoClose, autoCloseDuration]);

  if (!isVisible) return null;

  return (
    <>
      {/* Backdrop with blur */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40" onClick={onRetry} />
      
      {/* Toast centered on page */}
      <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-slate-900/40 border border-slate-700/60 rounded-lg shadow-2xl p-6 max-w-md backdrop-blur-lg">
          <div className="flex items-center justify-between gap-6 flex-col">
            <p className="text-slate-100 text-sm font-medium flex-1">{message}</p>
            <button
              onClick={onRetry}
              className="px-4 py-2 font-medium text-sm text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors flex-shrink-0 whitespace-nowrap cursor-pointer"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default Toast;
