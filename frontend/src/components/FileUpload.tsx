"use client";

import React, { useState, useCallback } from "react";
import { UploadCloudIcon, FileTextIcon, SparklesIcon } from "./Icons";

interface FileUploadProps {
  onStartAnalysis: (file: File, role: string) => void;
  onBack: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ onStartAnalysis, onBack }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState("");

  const handleDrag = useCallback(
    (e: React.DragEvent<HTMLDivElement | HTMLLabelElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.type === "dragenter" || e.type === "dragover") {
        setDragActive(true);
      } else if (e.type === "dragleave") {
        setDragActive(false);
      }
    },
    [],
  );

  const processFile = (selectedFile: File) => {
    setFile(selectedFile);
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (file) {
      onStartAnalysis(file, role);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center p-8 text-center fade-in">
      <div className="w-full max-w-3xl mb-4 text-left">
        <button
          onClick={onBack}
          className="text-sm cursor-pointer text-indigo-400 hover:text-indigo-300 transition-colors"
        >
          &larr; Back to Dashboard
        </button>
      </div>
      <div className="max-w-3xl">
        <h2 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          Transform Legal Docs into Clear Insights
        </h2>
        <p className="mt-6 text-lg leading-8 text-gray-400">
          Upload a contract, specify your role (e.g., Tenant, Employee), and let
          our AI provide an instant, easy-to-understand analysis.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-12 w-full max-w-2xl space-y-8"
      >
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <label
            htmlFor="dropzone-file"
            className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-300 group
              ${
                dragActive
                  ? "border-indigo-500 bg-indigo-500/20"
                  : "border-gray-700 bg-gray-500/5 hover:border-indigo-500/40"
              }`}
          >
            <div className="absolute top-0 left-0 w-full h-full rounded-xl bg-gradient-to-br from-indigo-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <div className="flex flex-col items-center justify-center pt-5 pb-6">
              <UploadCloudIcon
                className={`w-10 h-10 mb-4 transition-colors ${
                  dragActive
                    ? "text-indigo-400"
                    : "text-gray-500 group-hover:text-indigo-400"
                }`}
              />
              <p className="mb-2 text-sm text-gray-400">
                <span className="font-semibold text-indigo-400">
                  Click to upload
                </span>{" "}
                or drag and drop
              </p>
              <p className="text-xs text-gray-500">
                PDF, TXT, MD, or other plain text files
              </p>
              {file && (
                <div className="mt-4 flex items-center space-x-2 text-sm text-green-300 bg-green-500/10 px-3 py-1.5 rounded-full ring-1 ring-inset ring-green-500/20">
                  <FileTextIcon className="w-5 h-5" />
                  <span>{file.name}</span>
                </div>
              )}
            </div>
            <input
              id="dropzone-file"
              type="file"
              className="hidden"
              onChange={handleChange}
              accept=".txt,.md,text/plain,application/pdf"
            />
          </label>
        </div>

        {file && (
          <div className="w-full text-left fade-in">
            <label
              htmlFor="role-input"
              className="block text-sm font-medium text-gray-300 mb-2"
            >
              What is your role in this contract?
            </label>
            <input
              id="role-input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Tenant, Employee, Buyer"
              className="w-full p-3 bg-gray-900/70 border border-gray-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition text-white placeholder-gray-500"
            />
            <p className="mt-2 text-xs text-gray-500">
              Providing your role helps the AI give you a more tailored
              analysis.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!file}
          className="inline-flex cursor-pointer items-center justify-center px-10 py-4 font-semibold text-white bg-indigo-600 border border-transparent rounded-lg shadow-lg hover:bg-indigo-500 disabled:bg-gray-800 disabled:text-gray-500 disabled:cursor-not-allowed disabled:shadow-none transform hover:scale-105 transition-all duration-300 text-base"
        >
          Analyze Document
          <SparklesIcon className="ml-2 h-5 w-5" />
        </button>
      </form>
    </div>
  );
};

export default FileUpload;
