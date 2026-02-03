import { useEffect, useRef } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../ui/tooltip";

type ConsolePanelProps = {
  output: string;
  fontSize: number;
  running?: boolean;
  onStop?: () => void;
};

export const ConsolePanel = ({ output, fontSize, running, onStop }: ConsolePanelProps) => {
  const scrollRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [output]);

  return (
    <div
      className="relative flex h-full min-w-0 flex-col"
      style={{ background: "var(--console-bg)" }}
    >
      {running ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onStop}
                className="absolute right-6 top-2 z-10 inline-flex h-5 w-5 items-center justify-center rounded-[3px] bg-red-500 text-[0px] shadow-sm transition hover:bg-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                aria-label="Stop"
              >
                Stop
              </button>
            </TooltipTrigger>
            <TooltipContent side="left">Stop</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : null}
      <pre
        ref={scrollRef}
        className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden whitespace-pre-wrap break-words px-4 py-3 leading-relaxed ${
          running ? "pr-16" : ""
        }`}
        style={{
          color: "var(--console-fg)",
          fontFamily: "var(--editor-font)",
          fontSize,
          overflowWrap: "anywhere"
        }}
      >
        {output}
      </pre>
    </div>
  );
};
