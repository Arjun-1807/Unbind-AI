"use client";

import React, { useEffect, useRef, useState } from "react";
import { GoogleLogin, type CredentialResponse } from "@react-oauth/google";

interface ResponsiveGoogleButtonProps {
  onSuccess: (response: CredentialResponse) => void;
  onError: () => void;
}

// Google's Identity Services button takes a fixed pixel width (no percentage
// support), so a hardcoded value either wastes space on wide cards or
// overflows narrow ones. Measure the actual container instead.
const MAX_WIDTH = 368;

const ResponsiveGoogleButton: React.FC<ResponsiveGoogleButtonProps> = ({
  onSuccess,
  onError,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MAX_WIDTH);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setWidth(Math.min(MAX_WIDTH, Math.floor(entry.contentRect.width)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full flex justify-center overflow-x-hidden">
      <GoogleLogin
        onSuccess={onSuccess}
        onError={onError}
        theme="filled_black"
        shape="rectangular"
        width={width}
        text="continue_with"
      />
    </div>
  );
};

export default ResponsiveGoogleButton;
