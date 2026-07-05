"use client";

import React from "react";
import type { AnalysisResponse } from "@/types";
import { CalendarIcon } from "./Icons";

// Google Calendar logo SVG icon
const GoogleCalendarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="17" rx="2" fill="white" />
    <rect x="3" y="4" width="18" height="5" rx="2" fill="#4285F4" />
    <rect x="3" y="9" width="18" height="12" rx="0" fill="white" />
    <rect x="3" y="9" width="18" height="12" rx="0" fill="white" />
    <path d="M3 9h18v1H3z" fill="#E0E0E0" />
    <text x="12" y="19" textAnchor="middle" fontSize="7" fontWeight="bold" fill="#4285F4">G</text>
  </svg>
);

interface KeyDatesViewProps {
  analysisResult: AnalysisResponse;
}

const generateIcsFile = (dateStr: string, description: string) => {
  let startDate = new Date();
  try {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      startDate = parsedDate;
    }
  } catch {
    // Fallback to today if parsing fails
  }

  const pad = (num: number) => (num < 10 ? "0" + num : num);
  const formatDate = (date: Date) => {
    return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  };

  const icsContent = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//UnBind//AI Contract Analysis//EN",
    "BEGIN:VEVENT",
    `UID:${Date.now()}@unbind.app`,
    `DTSTAMP:${formatDate(new Date())}`,
    `DTSTART;VALUE=DATE:${formatDate(startDate).substring(0, 8)}`,
    `SUMMARY:${description}`,
    `DESCRIPTION:Key date from contract: ${description}. Date mentioned: ${dateStr}.`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([icsContent], { type: "text/calendar" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "contract_event.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const generateGoogleCalendarUrl = (dateStr: string, description: string): string => {
  let startDate = new Date();
  try {
    const parsedDate = new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      startDate = parsedDate;
    }
  } catch {
    // Fallback to today if parsing fails
  }

  // Format: YYYYMMDD for all-day events
  const pad = (num: number) => (num < 10 ? "0" + num : num);
  const formatGCalDate = (date: Date) =>
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;

  // End date is the next day for an all-day event
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 1);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: description,
    dates: `${formatGCalDate(startDate)}/${formatGCalDate(endDate)}`,
    details: `Key date from contract: ${description}. Date mentioned: ${dateStr}.`,
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const KeyDatesView: React.FC<KeyDatesViewProps> = ({ analysisResult }) => {
  if (!analysisResult.keyDates || analysisResult.keyDates.length === 0) {
    return (
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Key Dates
        </h3>
        <p className="text-gray-400">
          No specific dates or deadlines were identified in this document.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl sm:text-2xl font-bold text-white">
          Key Dates &amp; Deadlines
        </h3>
        <p className="text-gray-300 mt-2 max-w-3xl">
          The AI has identified the following important dates and deadlines. You
          can add them to your calendar for reminders.
        </p>
      </div>
      <div className="space-y-4">
        {analysisResult.keyDates.map((item, index) => (
          <div
            key={index}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-lg bg-gray-900/50 hover:bg-gray-900/80 border border-gray-700 transition-colors"
          >
            <div className="min-w-0">
              <p className="font-semibold text-indigo-300 break-words">
                {item.date}
              </p>
              <p className="text-sm text-gray-300 break-words">
                {item.description}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => generateIcsFile(item.date, item.description)}
                className="inline-flex cursor-pointer items-center px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-500 transition-colors"
                title="Download .ics file"
              >
                <CalendarIcon className="mr-1.5 h-4 w-4" />
                Add
              </button>
              <a
                href={generateGoogleCalendarUrl(item.date, item.description)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex cursor-pointer items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-white/10 border border-white/20 rounded-md hover:bg-white/20 transition-colors"
                title="Add to Google Calendar"
              >
                <GoogleCalendarIcon className="h-4 w-4 flex-shrink-0" />
                Google
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default KeyDatesView;
