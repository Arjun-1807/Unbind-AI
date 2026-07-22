"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloudIcon, FileTextIcon, SparklesIcon, CameraIcon } from "./Icons";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import BackLink from "./BackLink";

interface FileUploadProps {
  onStartAnalysis: (file: File, role: string) => void;
  onBack: () => void;
}

// Keep in sync with the backend guard (_MAX_IMAGE_BYTES in analysis_routes.py).
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

const isHeic = (f: File) =>
  /image\/hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name);
const isImage = (f: File) =>
  f.type.startsWith("image/") || /\.(jpe?g|png|webp|tiff?|bmp)$/i.test(f.name);

const FileUpload: React.FC<FileUploadProps> = ({ onStartAnalysis, onBack }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [role, setRole] = useState("");
  const [error, setError] = useState<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  // Show the camera capture affordance on small / touch-first devices only.
  const isMobile = useMediaQuery("(max-width: 640px)");

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
    setError(null);
    // HEIC (default iPhone format) can't be decoded server-side without extra
    // libs — guide the user to a supported format up front.
    if (isHeic(selectedFile)) {
      setError(
        "iPhone HEIC photos aren't supported directly. Set your camera to " +
          "'Most Compatible' (JPEG), or upload a screenshot of the photo.",
      );
      return;
    }
    if (isImage(selectedFile) && selectedFile.size > MAX_IMAGE_BYTES) {
      setError("That image is too large (max 15 MB). Try a smaller photo.");
      return;
    }
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
    <div className="flex flex-col items-center justify-center p-4 sm:p-8 text-center fade-in">
      <div className="w-full max-w-3xl mb-4 text-left">
        <BackLink onClick={onBack}>Back to Dashboard</BackLink>
      </div>
      <div className="w-full max-w-3xl">
        <h2 className="text-3xl font-semibold tracking-tight text-ink sm:text-4xl md:text-5xl">
          Transform Legal Docs into Clear Insights
        </h2>
        <p className="mt-4 sm:mt-6 text-base sm:text-lg leading-8 text-ink-subtle">
          Upload a contract, specify your role (e.g., Tenant, Employee), and let
          our AI provide an instant, easy-to-understand analysis.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-8 sm:mt-12 w-full max-w-2xl space-y-6 sm:space-y-8"
      >
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <label
            htmlFor="dropzone-file"
            className={`relative flex flex-col items-center justify-center w-full min-h-56 sm:h-64 p-6 sm:p-10 border border-dashed rounded-xl cursor-pointer transition-colors duration-200 group
              ${
                dragActive
                  ? "border-hairline-strong bg-surface-2"
                  : "border-hairline bg-surface-1 hover:border-hairline-strong"
              }`}
          >
            <div className="flex w-full min-w-0 flex-col items-center justify-center pt-5 pb-6">
              <UploadCloudIcon
                className={`w-8 h-8 sm:w-10 sm:h-10 mb-4 transition-colors ${
                  dragActive
                    ? "text-primary"
                    : "text-ink-subtle group-hover:text-primary"
                }`}
              />
              <p className="mb-2 text-sm text-ink-subtle">
                <span className="font-medium text-primary">
                  Click to upload
                </span>{" "}
                or drag and drop
              </p>
              <p className="text-xs text-ink-subtle">
                PDF, DOCX, TXT, MD — or a photo/scan of a contract (JPG, PNG)
              </p>
              {file && (
                <div className="mt-4 flex max-w-full min-w-0 items-center space-x-2 text-sm text-success bg-success/10 px-3 py-1.5 rounded-full ring-1 ring-inset ring-success/20">
                  <FileTextIcon className="w-5 h-5 shrink-0" />
                  <span className="min-w-0 truncate">{file.name}</span>
                </div>
              )}
            </div>
            <input
              id="dropzone-file"
              type="file"
              className="hidden"
              onChange={handleChange}
              accept=".txt,.md,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/*,.jpg,.jpeg,.png,.webp"
            />
          </label>
        </div>

        {/* Mobile: capture a photo of a paper contract with the rear camera. */}
        {isMobile && (
          <>
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="ln-btn-secondary inline-flex w-full cursor-pointer items-center justify-center px-6 py-3 text-sm"
            >
              <CameraIcon className="mr-2 h-5 w-5" />
              Take a photo of your contract
            </button>
            <input
              ref={cameraInputRef}
              type="file"
              className="hidden"
              accept="image/*"
              capture="environment"
              onChange={handleChange}
            />
          </>
        )}

        {error && (
          <p className="text-sm text-danger text-left" role="alert">
            {error}
          </p>
        )}

        {file && (
          <div className="w-full text-left fade-in">
            <label
              htmlFor="role-input"
              className="block text-sm font-medium text-ink-muted mb-2"
            >
              What is your role in this contract?
            </label>
            <input
              id="role-input"
              type="text"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g., Tenant, Employee, Buyer"
              className="ln-input w-full p-3"
            />
            <p className="mt-2 text-xs text-ink-subtle">
              Providing your role helps the AI give you a more tailored
              analysis.
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={!file}
          className="ln-btn-primary inline-flex w-full sm:w-auto cursor-pointer items-center justify-center px-10 py-4 text-base"
        >
          Analyze Document
          <SparklesIcon className="ml-2 h-5 w-5" />
        </button>
      </form>
    </div>
  );
};

export default FileUpload;
