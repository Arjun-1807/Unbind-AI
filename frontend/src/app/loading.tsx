"use client";

export default function Loading() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="flex flex-col items-center space-y-6">
        
        {/* Scale Container */}
        <div className="relative w-24 h-24 animate-tilt">
          
          {/* SVG Scale */}
          <svg
            viewBox="0 0 64 64"
            fill="none"
            stroke="currentColor"
            className="w-full h-full text-indigo-400"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Stand */}
            <line x1="32" y1="8" x2="32" y2="48" />
            <line x1="16" y1="16" x2="48" y2="16" />
            <line x1="24" y1="48" x2="40" y2="48" />
            <line x1="20" y1="56" x2="44" y2="56" />

            {/* Left scale */}
            <line x1="16" y1="16" x2="10" y2="28" />
            <circle cx="10" cy="32" r="6" />

            {/* Right scale */}
            <line x1="48" y1="16" x2="54" y2="28" />
            <circle cx="54" cy="32" r="6" />
          </svg>
        </div>

        <p className="text-sm text-gray-400 tracking-wide">
          Analyzing contract...
        </p>
      </div>
    </div>
  );
}
