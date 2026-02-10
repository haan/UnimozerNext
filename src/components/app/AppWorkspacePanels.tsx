import type { ComponentProps, PointerEvent as ReactPointerEvent, RefObject } from "react";

import { ObjectBenchSection } from "./ObjectBenchSection";
import { SplitHandle } from "../ui/split-handle";
import { CodePanel } from "../editor/CodePanel";
import { ConsolePanel } from "../console/ConsolePanel";

type AppWorkspacePanelsProps = {
  containerRef: RefObject<HTMLDivElement | null>;
  consoleContainerRef: RefObject<HTMLDivElement | null>;
  splitRatio: number;
  consoleSplitRatio: number;
  onStartUmlResize: (event: ReactPointerEvent<HTMLElement>) => void;
  onStartConsoleResize: (event: ReactPointerEvent<HTMLElement>) => void;
  objectBenchSectionProps: ComponentProps<typeof ObjectBenchSection>;
  codePanelProps: ComponentProps<typeof CodePanel>;
  consolePanelProps: ComponentProps<typeof ConsolePanel>;
  editorMinHeightPx: number;
  consoleMinHeightPx: number;
};

export const AppWorkspacePanels = ({
  containerRef,
  consoleContainerRef,
  splitRatio,
  consoleSplitRatio,
  onStartUmlResize,
  onStartConsoleResize,
  objectBenchSectionProps,
  codePanelProps,
  consolePanelProps,
  editorMinHeightPx,
  consoleMinHeightPx
}: AppWorkspacePanelsProps) => (
  <div className="flex flex-1 overflow-hidden">
    <main className="flex flex-1 flex-col bg-background">
      <div ref={containerRef} className="relative flex flex-1 overflow-hidden">
        <div className="h-full min-w-0 overflow-hidden" style={{ width: `${splitRatio * 100}%` }}>
          <ObjectBenchSection {...objectBenchSectionProps} />
        </div>

        <SplitHandle
          orientation="vertical"
          positionPercent={splitRatio * 100}
          ariaLabel="Resize information panel"
          onPointerDown={onStartUmlResize}
        />

        <section className="flex min-w-0 flex-1 flex-col">
          <div
            ref={consoleContainerRef}
            className="relative flex min-h-0 flex-1 flex-col overflow-hidden"
          >
            <div
              className="flex-none overflow-hidden"
              style={{
                height: `${consoleSplitRatio * 100}%`,
                minHeight: `${editorMinHeightPx}px`
              }}
            >
              <CodePanel {...codePanelProps} />
            </div>
            <SplitHandle
              orientation="horizontal"
              positionPercent={consoleSplitRatio * 100}
              ariaLabel="Resize console panel"
              onPointerDown={onStartConsoleResize}
            />
            <div className="flex-1 overflow-hidden" style={{ minHeight: `${consoleMinHeightPx}px` }}>
              <ConsolePanel {...consolePanelProps} />
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
);
