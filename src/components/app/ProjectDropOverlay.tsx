type ProjectDropOverlayProps = {
  visible: boolean;
};

export const ProjectDropOverlay = ({ visible }: ProjectDropOverlayProps) => {
  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-8 text-center text-foreground backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <div
        className="absolute inset-5 rounded-xl border-2 border-dashed border-primary/50"
        aria-hidden="true"
      />
      <div className="flex flex-col gap-3">
        <p className="text-3xl font-semibold tracking-tight">Drop to open project</p>
        <p className="text-base text-muted-foreground">One folder or .umz file</p>
      </div>
    </div>
  );
};
