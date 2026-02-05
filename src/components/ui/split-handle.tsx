type SplitHandleProps = {
  orientation: "vertical" | "horizontal";
  positionPercent: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  ariaLabel: string;
};

export const SplitHandle = ({
  orientation,
  positionPercent,
  onPointerDown,
  ariaLabel
}: SplitHandleProps) => {
  if (orientation === "vertical") {
    return (
      <div
        className="absolute top-0 h-full w-3 -translate-x-1.5 cursor-col-resize transition hover:bg-border/80"
        style={{ left: `${positionPercent}%` }}
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
      >
        <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/60" />
      </div>
    );
  }

  return (
    <div
      className="editor-separator-handle absolute left-0 w-full h-3 -translate-y-1.5 cursor-row-resize"
      style={{ top: `${positionPercent}%` }}
      role="separator"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      onPointerDown={onPointerDown}
    >
      <div className="editor-separator-line pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2" />
    </div>
  );
};
