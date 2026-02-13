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
        className="editor-separator-handle absolute top-0 z-10 h-full w-2.5 -translate-x-1/2 cursor-col-resize"
        style={{ left: `${positionPercent}%` }}
        role="separator"
        aria-orientation="vertical"
        aria-label={ariaLabel}
        onPointerDown={onPointerDown}
      >
        <div className="editor-separator-line pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2" />
      </div>
    );
  }

  return (
    <div
      className="editor-separator-handle absolute left-0 z-10 h-2.5 w-full -translate-y-1/2 cursor-row-resize"
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
