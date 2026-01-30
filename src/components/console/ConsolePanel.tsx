import { useEffect, useRef } from "react";

type ConsolePanelProps = {
  output: string;
  running?: boolean;
  onStop?: () => void;
};

export const ConsolePanel = ({ output, running, onStop }: ConsolePanelProps) => {
  const scrollRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [output]);

  return (
    <div
      className="relative flex h-full flex-col border-t border-border"
      style={{ background: "var(--console-bg)" }}
    >
      {running ? (
        <button
          type="button"
          onClick={onStop}
          className="absolute right-6 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-[3px] bg-red-500 text-[0px] shadow-sm transition hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
          aria-label="Stop"
          title="Stop"
        >
          Stop
        </button>
      ) : null}
      <pre
        ref={scrollRef}
        className={`flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 text-xs leading-relaxed ${
          running ? "pr-16 pt-8" : ""
        }`}
        style={{ color: "var(--console-fg)" }}
      >
        {output}
      </pre>
    </div>
  );
};
