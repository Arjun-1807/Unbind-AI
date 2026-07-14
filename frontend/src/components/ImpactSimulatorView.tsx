"use client";

import React, { useState, useCallback, useRef } from "react";
import * as api from "@/services/api";
import { SparklesIcon } from "./Icons";

interface ImpactSimulatorViewProps {
  documentText: string;
  onError: (message: string) => void;
}

const ImpactSimulatorView: React.FC<ImpactSimulatorViewProps> = ({
  documentText,
  onError,
}) => {
  const [scenario, setScenario] = useState<string>("");
  const [result, setResult] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [history, setHistory] = useState<
    Array<{ id: string; scenario: string; result: string; ts: number }>
  >([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const runSimulation = useCallback(async () => {
    if (!scenario || isLoading) return;
    setIsLoading(true);
    setResult("");
    onError("");
    try {
      const simulationResult = await api.simulateImpact(documentText, scenario);
      setResult(simulationResult);
      setHistory((prev) => [
        {
          id: `sim_${Date.now()}`,
          scenario,
          result: simulationResult,
          ts: Date.now(),
        },
        ...prev,
      ]);
    } catch (err) {
      onError(
        err instanceof Error
          ? err.message
          : "An unknown error occurred during simulation.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [scenario, isLoading, documentText, onError]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      runSimulation();
    },
    [runSimulation],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      runSimulation();
    }
  };

  const handleReset = () => {
    setScenario("");
    textareaRef.current?.focus();
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="text-xl sm:text-2xl font-semibold text-ink">
          Impact Simulator
        </h3>
        <p className="text-ink-muted mt-2 max-w-3xl">
          Test potential real-world scenarios against your contract. Enter a
          situation (e.g., &quot;What if I quit my job after 3 months?&quot;) to
          understand the legal and financial consequences.
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          ref={textareaRef}
          value={scenario}
          onChange={(e) => setScenario(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Enter a scenario, for example: 'What happens if I miss a rent payment by one week?'"
          className="w-full p-3 ln-input"
          rows={3}
          disabled={isLoading}
        />
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <button
            type="submit"
            disabled={isLoading || !scenario}
            className="inline-flex w-full sm:w-auto justify-center cursor-pointer items-center px-6 py-2.5 ln-btn-primary"
          >
            {isLoading ? "Simulating..." : "Simulate Impact"}
            <SparklesIcon className="ml-2 h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            disabled={isLoading}
            className="inline-flex w-full sm:w-auto justify-center cursor-pointer items-center px-4 py-2.5 ln-btn-secondary disabled:opacity-50"
          >
            Reset
          </button>
        </div>
      </form>

      {isLoading && (
        <div className="flex items-center justify-center p-6 text-ink-subtle">
          <svg
            className="animate-spin -ml-1 mr-3 h-5 w-5 text-primary"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            ></circle>
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
          Analyzing potential outcomes...
        </div>
      )}

      {result && (
        <div className="mt-6 p-4 sm:p-5 ln-card fade-in">
          <h4 className="font-semibold text-lg text-primary mb-2">
            Simulation Result
          </h4>
          <p className="text-ink-muted whitespace-pre-wrap break-words leading-relaxed">
            {result}
          </p>
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8 space-y-3">
          <h4 className="font-semibold text-lg text-primary">
            Previous Simulations
          </h4>
          <ul className="space-y-3">
            {history.map((item) => (
              <li
                key={item.id}
                className="ln-card p-4"
              >
                <div className="text-sm text-ink-subtle mb-1">
                  {new Date(item.ts).toLocaleString()}
                </div>
                <div className="text-ink-muted break-words">
                  <span className="font-semibold text-ink">
                    Scenario:
                  </span>{" "}
                  {item.scenario}
                </div>
                <div className="text-ink-muted mt-2 whitespace-pre-wrap break-words">
                  <span className="font-semibold text-ink">Answer:</span>{" "}
                  {item.result}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ImpactSimulatorView;
