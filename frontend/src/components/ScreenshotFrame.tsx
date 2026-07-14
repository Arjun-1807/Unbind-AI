type ScreenshotFrameProps = {
  src: string;
  alt: string;
  title?: string;
  url?: string;
  showControls?: boolean;
  showUrlBar?: boolean;
  maxWidth?: number | string;
  scale?: number;
  className?: string;
  contentClassName?: string;
  imageClassName?: string;
  priority?: boolean;
};

const controlColors = ["#ff5f57", "#febc2e", "#28c840"];

const ScreenshotFrame = ({
  src,
  alt,
  title = "App preview",
  url,
  showControls = true,
  showUrlBar = false,
  maxWidth = 1040,
  scale = 1,
  className = "",
  contentClassName = "",
  imageClassName = "",
  priority = false,
}: ScreenshotFrameProps) => {
  const resolvedMaxWidth =
    typeof maxWidth === "number" ? `${maxWidth}px` : maxWidth;

  return (
    <div
      className={className}
      style={{
        maxWidth: resolvedMaxWidth,
        transform: `scale(${scale})`,
        transformOrigin: "top center",
        width: "100%",
      }}
    >
      <div
        className="overflow-hidden bg-white"
        style={{
          borderRadius: 12,
          border: "1px solid rgba(0, 0, 0, 0.1)",
          boxShadow:
            "0 20px 60px rgba(0,0,0,0.15), 0 4px 16px rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="bg-surface-1 px-4 py-3"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.08)" }}
        >
          <div className="flex items-center gap-3">
            <div className="flex min-w-[42px] items-center gap-1.5">
              {showControls
                ? controlColors.map((color) => (
                    <span
                      key={color}
                      className="block h-3 w-3 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ))
                : null}
            </div>
            <div className="min-w-0 flex-1 text-center text-xs font-medium tracking-[0.01em] text-ink-muted">
              <span className="block truncate">{title}</span>
            </div>
            <div className="w-[42px] shrink-0" aria-hidden="true" />
          </div>
          {showUrlBar ? (
            <div
              className="mt-3 rounded-full bg-surface-2 px-3 py-2 text-xs text-ink-subtle"
              style={{ border: "1px solid rgba(255, 255, 255, 0.08)" }}
            >
              <span className="block truncate">{url ?? "app.unbind.ai/analysis"}</span>
            </div>
          ) : null}
        </div>
        <div className={contentClassName}>
          <img
            src={src}
            alt={alt}
            className={`block h-auto w-full ${imageClassName}`.trim()}
            loading={priority ? "eager" : "lazy"}
          />
        </div>
      </div>
    </div>
  );
};

export default ScreenshotFrame;
